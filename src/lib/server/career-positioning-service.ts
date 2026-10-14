import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { loadExecutionConversation } from "@/lib/agent/runtime/execution-session-service";
import { getDataRepositories } from "@/lib/data-repositories";
import { isCareerPositioningConfirmation, parseCareerPositioningScene, scopeCareerPositioningMessages, verifyCareerPositioningSources, type CareerPositioningScene } from "@/lib/agent/career-positioning-result";
import { createHash } from "node:crypto";

export async function loadCareerPositioningScene(principal: ExecutionPrincipal, conversationId: number | null): Promise<CareerPositioningScene | null> {
  if (conversationId === null) return null;
  const conversation = await getDataRepositories().sessions.get(conversationId, principal.userId);
  if (!conversation) throw new Error("定位来源会话不存在或不属于当前账号");
  return parseCareerPositioningScene(parseObject(conversation.agent_state_json ?? conversation.agentState).careerPositioningScene);
}

export async function confirmCareerPositioning(principal: ExecutionPrincipal, input: {
  conversationId: number;
  artifact: unknown;
  confirmation: string;
}): Promise<{ role: string; readBackVerified: true }> {
  if (!Number.isSafeInteger(input.conversationId) || input.conversationId <= 0 || !isCareerPositioningConfirmation(input.confirmation)) {
    throw new Error("请明确确认当前会话的定位结果后再保存");
  }
  const repositories = getDataRepositories();
  const conversation = await repositories.sessions.get(input.conversationId, principal.userId);
  if (!conversation) throw new Error("定位结果来源会话不存在或不属于当前账号");
  const scene = parseCareerPositioningScene(parseObject(conversation.agent_state_json ?? conversation.agentState).careerPositioningScene);
  const messages = scopeCareerPositioningMessages(await loadExecutionConversation(principal, input.conversationId), scene);
  const confirmationIndex = messages.findLastIndex((message) => message.role === "user");
  const latestUser = messages[confirmationIndex];
  if (!latestUser || latestUser.content.trim() !== input.confirmation.trim()) {
    throw new Error("定位确认与服务端当前用户原文不一致");
  }
  const sourceMessages = messages.slice(0, confirmationIndex);
  const artifact = verifyCareerPositioningSources(input.artifact, sourceMessages.flatMap((message) =>
    message.role === "user" || message.role === "assistant" || message.role === "tool"
      ? [{ role: message.role, content: message.content, itemId: message.itemId || message.id, toolName: message.toolName, toolResult: message.toolResult }] : []));
  const presented = sourceMessages.findLast((message) => message.role === "assistant");
  if (!presented || !presented.content.includes(artifact.positioningSummary)
    || !artifact.sourceEvidence.every((evidence) => presented.content.includes(evidence.evidenceId))) {
    throw new Error("请先展示当前定位假设与完整来源证据，再请求用户确认");
  }
  const current = await repositories.profiles.get(principal.userId);
  const data = parseObject(current?.data_json);
  const currentGoals = parseObject(current?.goals_json);
  const confirmationHash = createHash("sha256").update(canonical({ conversationId: input.conversationId, sourceEvidence: artifact.sourceEvidence, targetRoles: artifact.targetRoles })).digest("hex");
  const goals = {
    ...currentGoals,
    targetRoles: artifact.targetRoles,
    positioningSummary: artifact.positioningSummary,
    positioningEvidence: artifact.evidence,
    positioningSourceEvidence: artifact.sourceEvidence,
    positioningScenario: artifact.targetScenario,
    positioningMvp: artifact.mvp,
    nextActions: artifact.nextActions,
    positioningConfirmationHash: confirmationHash,
  };
  const history = parseArray(current?.history_json);
  if (currentGoals.positioningConfirmationHash !== confirmationHash) history.push(artifact.historyEntry);
  await repositories.profiles.upsert(principal.userId, JSON.stringify(data), JSON.stringify(history), JSON.stringify(goals));
  const readBack = await repositories.profiles.get(principal.userId);
  if (!readBack || canonical(parseObject(readBack.data_json)) !== canonical(data)
    || canonical(parseObject(readBack.goals_json)) !== canonical(goals)
    || canonical(parseArray(readBack.history_json)) !== canonical(history)) {
    throw new Error("画像写入后读回校验失败，定位来源或原有画像不一致");
  }
  const signalContent = {
    role: artifact.roleSignal.role, reason: artifact.roleSignal.reason, evidence: artifact.roleSignal.evidence,
    confidence: artifact.roleSignal.confidence, sourceEvidence: artifact.sourceEvidence,
    provenanceCategory: "hypothesis", status: "confirmed", confirmationHash,
  };
  const signalQuery = { source: "dingwei", signal_type: "role_preference", limit: 100 };
  const priorSignals = await repositories.signals.query(signalQuery, principal.userId);
  if (!priorSignals.some((signal) => parseObject(signal.content_json).confirmationHash === confirmationHash)) {
    await repositories.signals.insert({
      source: "dingwei", signal_type: "role_preference", content_json: JSON.stringify(signalContent),
      session_id: String(input.conversationId),
    }, principal.userId);
  }
  const signals = await repositories.signals.query(signalQuery, principal.userId);
  if (!signals.some((signal) => canonical(parseObject(signal.content_json)) === canonical(signalContent)
    && String(signal.session_id) === String(input.conversationId))) {
    throw new Error("画像信号写入校验失败，来源证据未完整读回");
  }
  return { role: artifact.targetRoles[0].role, readBackVerified: true };
}

function parseObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function parseArray(value: unknown): unknown[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed : [];
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([first], [second]) => first.localeCompare(second))) : item);
}
