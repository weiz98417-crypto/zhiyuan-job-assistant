import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { loadExecutionConversation } from "@/lib/agent/runtime/execution-session-service";
import { buildCareerPositioningArtifact, isCareerPositioningConfirmation, isCareerPositioningReset, parseCareerPositioningScene, scopeCareerPositioningMessages, type CareerPositioningScene, type PositioningMessage } from "@/lib/agent/career-positioning-result";
import { getStagePrompt, type SOPState } from "@/lib/agent/profile-sop";
import { getDataRepositories } from "@/lib/data-repositories";
import { confirmCareerPositioning } from "@/lib/server/career-positioning-service";
import { stableContentHash } from "@/lib/agent/verified-action";

export interface ProfileSopInput {
  action: string;
  answer?: string;
  conversationId?: number | null;
}

export async function runProfileSop(
  principal: ExecutionPrincipal,
  input: ProfileSopInput,
): Promise<Record<string, unknown>> {
  const conversationId = input.conversationId;
  if (!Number.isSafeInteger(conversationId) || Number(conversationId) <= 0) {
    throw new Error("请提供当前定位来源会话");
  }
  const repositories = getDataRepositories();
  const conversation = await repositories.sessions.get(conversationId!, principal.userId);
  if (!conversation) {
    throw new Error("定位来源会话不存在或不属于当前账号");
  }
  const stored = await loadExecutionConversation(principal, conversationId!);
  const allMessages: PositioningMessage[] = stored.flatMap((message) =>
    message.role === "user" || message.role === "assistant" || message.role === "tool"
      ? [{ role: message.role, content: message.content, itemId: message.itemId || message.id, toolName: message.toolName, toolResult: message.toolResult }] : []);
  const agentState = parseState(conversation.agent_state_json ?? conversation.agentState);
  const scene = parseCareerPositioningScene(agentState.careerPositioningScene);
  const messages = scopeCareerPositioningMessages(allMessages, scene);
  const action = input.action || "start";
  if (action === "reset") {
    const resetTurn = allMessages.findLast((message) => message.role === "user");
    if (!resetTurn?.itemId || !isCareerPositioningReset(resetTurn.content)) {
      throw new Error("请在当前会话明确提出重置或重新开始定位");
    }
    const nextScene: CareerPositioningScene = {
      kind: "career_positioning_scene", version: 1,
      startAfterTurnId: resetTurn.itemId, startAfterContent: resetTurn.content,
      startAfterContentHash: stableContentHash(resetTurn.content),
    };
    const nextState = { ...agentState, careerPositioningScene: nextScene };
    if (canonical(scene) !== canonical(nextScene)) {
      const interviewState = parseState(conversation.interview_state_json ?? conversation.interviewState);
      const updated = await repositories.sessions.update(conversationId!, principal.userId, {
        agentState: nextState,
        expectedInterviewCheckpointVersion: Number(interviewState.checkpointVersion) || 0,
      });
      if (!updated) throw new Error("定位重置写入冲突，请刷新后重试");
    }
    const readBack = await repositories.sessions.get(conversationId!, principal.userId);
    if (!readBack || canonical(parseState(readBack.agent_state_json ?? readBack.agentState)) !== canonical(nextState)) {
      throw new Error("定位场次重置读回校验失败");
    }
    scopeCareerPositioningMessages(await loadExecutionConversation(principal, conversationId!), nextScene);
    return { stage: 0, reset: true, done: false, prompt: getStagePrompt(0), collected: {}, readBackVerified: true, careerPositioningScene: nextScene };
  }
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const latest = messages[lastUserIndex]?.content.trim() || "";

  if (action === "complete") {
    if (!isCareerPositioningConfirmation(latest)) throw new Error("请明确确认已展示的定位结果后再保存");
    const artifact = buildCareerPositioningArtifact(messages.slice(0, lastUserIndex));
    if (!artifact?.sourceEvidence.length) throw new Error("定位结果缺少有效来源证据，请补充本人真实经历");
    const saved = await confirmCareerPositioning(principal, { conversationId: conversationId!, artifact, confirmation: latest });
    return { ...saved, stage: 5, done: true, summary: `定位假设已保存：${saved.role}。原始来源已独立读回，可在 /profile 页面查看。` };
  }
  if (action === "answer" && (!latest || input.answer?.trim() !== latest)) {
    throw new Error("请提供当前用户原文，不能改写回答或补造确认");
  }
  if (!["start", "stage_prompt", "answer"].includes(action)) throw new Error(`Unknown action: ${action}`);

  const userMessages = messages.filter((message) => message.role === "user" && message.content.trim()
    && !isCareerPositioningConfirmation(message.content));
  const answers = scene ? userMessages : userMessages.slice(1);
  const firstAnswer = answers[0]?.content.trim() || "";
  const branch: SOPState["branch"] = /^(?:A[.、：:\s]|A$)|在找|投简历|在投/.test(firstAnswer) ? "A"
    : /^(?:C[.、：:\s]|C$)|应届|在校|完全没方向|没方向/.test(firstAnswer) ? "C"
      : /^(?:D[.、：:\s]|D$)|纠结|几个方向|比较/.test(firstAnswer) ? "D" : "B";
  const stage = Math.min(answers.length, 4);
  return {
    stage, branch, done: false, prompt: getStagePrompt(stage, branch),
    collected: Object.fromEntries(answers.map((message, index) => [`stage_${index}`, message.content])),
    isResume: stage > 0, alreadyStarted: stage > 0,
    sourceAuthority: "persistent_conversation",
  };
}

function parseState(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([first], [second]) => first.localeCompare(second))) : item);
}
