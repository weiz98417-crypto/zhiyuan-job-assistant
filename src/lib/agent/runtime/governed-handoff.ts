import { createHash } from "crypto";
import { getAgentCard, validateHandoff } from "@/lib/agent/agent-collaboration";
import type { AgentTaskContract } from "@/lib/agent/task-contract";
import type { AgentRunCheckpoint, AgentRunFactReference, AgentRunSnapshot, DurableAgentRunService } from "@/lib/agent/runtime/durable-agent-run";
import { assertCurrentWorker, stableJson } from "@/lib/agent/runtime/research-delegation";
import type { ToolExecutionContext, ToolResult } from "@/lib/agent/tools/types";
import { readCollaborationSources } from "@/lib/agent/runtime/collaboration-sources";
import { readCollaborationAuthorization } from "@/lib/agent/runtime/collaboration-authorization";
import { constrainTaskContract } from "@/lib/agent/run-admission";
import { deriveIntentConstraints } from "@/lib/agent/intent-constraints";

export async function executeGovernedHandoff(runtime: DurableAgentRunService, params: Record<string, unknown>,
  context: ToolExecutionContext): Promise<ToolResult> {
  let persistedHandoff: Record<string, unknown> | undefined;
  try {
    const run = await runtime.getRun(context.principal, context.runId);
    assertCurrentWorker(run, context);
    if (!context.allowlist.includes("transfer_to_agent")) throw new Error("当前 Run 未授权主责交接工具");
    const contract = run!.contract as AgentTaskContract;
    if (!contract?.taskType || !contract.target || !contract.program) throw new Error("主责交接缺少已绑定目标和 Program");
    const targetAgentId = typeof params.target_agent_id === "string" ? params.target_agent_id : "";
    const card = getAgentCard(targetAgentId);
    const { getAgentById } = await import("@/lib/agent/registry");
    const agent = getAgentById(targetAgentId);
    if (!card || !agent) throw new Error("主责交接目标专家不可用");
    const checkpoint = await runtime.getLatestCheckpoint(context.principal, run!.id);
    if (!checkpoint) throw new Error("主责交接缺少持久化安全检查点");
    const messages = Array.isArray(checkpoint.context.conversationMessages) ? checkpoint.context.conversationMessages : [];
    const goal = typeof params.goal === "string" ? params.goal.trim() : "";
    const authorization = readCollaborationAuthorization(messages, "handoff", targetAgentId, goal);
    const { turnId, quote } = authorization;
    if (goal !== contract.target || params.target_task_type !== undefined && params.target_task_type !== contract.taskType) {
      const validation = validateHandoff({ currentTask: contract.taskType, targetAgentId });
      const reason = "跨目标交接必须通过 Run Admission 创建新 Run；当前 Run 保留原目标，交接尚未执行。";
      return { success: false, data: { admissionRequired: true, state: "admission_required", runId: run!.id,
        targetAgentId, goal, fromTask: contract.taskType, toTask: validation.toTask, legalTransition: validation.allowed },
        error: reason, errorCategory: "need_user_input", recoverable: false, llmSummary: reason,
        uiPayload: { type: "handoff_denied", reason, state: "admission_required", admissionRequired: true } };
    }
    const requested = params.source_artifact_ids;
    if (requested !== undefined && (!Array.isArray(requested) || requested.some((id) => typeof id !== "string"))) throw new Error("交接来源必须为已绑定材料 ID 集合");
    const sourceArtifactIds = [...new Set([turnId, ...((requested === undefined ? checkpoint.factRefs.map((ref) => ref.id) : requested) as string[])])].sort();
    if (sourceArtifactIds.some((id) => id !== turnId && !checkpoint.factRefs.some((ref) => ref.id === id))) throw new Error("交接来源不属于当前 Run");
    const sourceRefs = checkpoint.factRefs.filter((ref) => sourceArtifactIds.includes(ref.id));
    const sourceContents = await readCollaborationSources(run!, checkpoint, sourceRefs);
    const allowedTools = agent.toolNames.filter((name) => context.allowlist.includes(name)
      && (!contract.routing?.allowedTools || contract.routing.allowedTools.includes(name)));
    if (!allowedTools.length) throw new Error("交接目标没有在当前 Run 允许范围内的工具");
    const handoffId = "handoff-" + digest(stableJson({ runId: run!.id, targetAgentId, goal, authorization,
      sourceRefs, sourceContents, sourceArtifactIds, contract, allowedTools })).slice(0, 40);
    const prior = (await runtime.listEvents(context.principal, run!.id, 0)).find((entry) =>
      entry.type === "run.handoff_completed" && record(entry.payload.handoff).handoffId === handoffId);
    const saved = record(checkpoint.context.specialistHandoff);
    const handoff = prior ? record(prior.payload.handoff) : saved.handoffId === handoffId ? saved : {
      handoffId, runId: run!.id, agentId: targetAgentId, fromAgentId: run!.agentId, goal,
      fromTask: contract.taskType, toTask: contract.taskType, contract, reason: quote, authorization, sourceArtifactIds, sourceRefs, sourceContents,
      constraints: contract.routing?.intentConstraints || {}, allowedTools, progress: checkpoint.plan,
      findings: messages.filter((entry) => record(entry).role === "tool").slice(-5).map((entry) => ({
        sourceId: record(entry).id || record(entry).itemId,
        summary: typeof record(entry).content === "string" ? String(record(entry).content).slice(0, 900) : "" })),
      readBackVerified: true,
    };
    if (!prior) {
      if (context.signal?.aborted) throw new Error("主责交接已取消");
      if (saved.handoffId !== handoffId) await runtime.saveCheckpoint({ runId: run!.id, workerId: context.workerId!, fencingToken: context.fencingToken!,
        boundary: "handoff_completed", effectiveTask: { contract, agentId: targetAgentId },
        context: { ...checkpoint.context, specialistHandoff: handoff }, plan: checkpoint.plan,
        budgets: checkpoint.budgets, factRefs: checkpoint.factRefs });
      persistedHandoff = handoff;
      const readBack = await runtime.getRun(context.principal, run!.id);
      const readBackCheckpoint = await runtime.getLatestCheckpoint(context.principal, run!.id);
      assertCurrentWorker(readBack, context);
      if (readBack?.agentId !== targetAgentId || stableJson(readBack.contract) !== stableJson(contract)
        || stableJson(readBackCheckpoint?.context.specialistHandoff) !== stableJson(handoff)
        || stableJson(readBackCheckpoint?.factRefs) !== stableJson(checkpoint.factRefs)) throw new Error("主责交接读回不一致");
      await runtime.recordEvent({ runId: run!.id, workerId: context.workerId!, fencingToken: context.fencingToken!,
        type: "run.handoff_completed", payload: { handoff } });
    }
    return { success: true, data: { handoff }, errorCategory: "ok", llmSummary: JSON.stringify(handoff),
      uiPayload: { type: "handoff", handoffId, runId: run!.id, agentId: targetAgentId, fromTask: contract.taskType,
        toTask: contract.taskType, goal, sourceArtifactIds, constraints: handoff.constraints, findings: handoff.findings,
        readBackVerified: true } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "主责交接验证失败";
    if (persistedHandoff) return { success: false, data: { handoffPersistence: persistedHandoff, state: "audit_pending" },
      error: "主责身份已持久化，交接审计尚未完成，需要恢复同一交接：" + reason,
      errorCategory: "transient", recoverable: true };
    return { success: false, data: null, error: reason, errorCategory: "policy_denied", recoverable: false,
      uiPayload: { type: "handoff_denied", reason } };
  }
}

export async function restoreGovernedHandoff(runtime: DurableAgentRunService, run: AgentRunSnapshot,
  checkpoint: AgentRunCheckpoint | null, signal: AbortSignal, repairAudit = true): Promise<Record<string, unknown> | null> {
  const events = await runtime.listEvents({ userId: run.userId }, run.id, 0);
  const audited = events.findLast((event) => event.type === "run.handoff_completed");
  const saved = record(checkpoint?.context.specialistHandoff);
  const planned = record(checkpoint?.plan.specialistHandoff);
  const handoff = Object.keys(saved).length ? saved : Object.keys(planned).length ? planned : record(audited?.payload.handoff);
  if (!Object.keys(handoff).length) return null;
  const contract = run.contract as AgentTaskContract;
  const frozenContract = handoff.contract as AgentTaskContract;
  const authorization = record(handoff.authorization);
  const targetAgentId = typeof handoff.agentId === "string" ? handoff.agentId : "";
  const { getAgentById } = await import("@/lib/agent/registry");
  const agent = getAgentById(targetAgentId);
  const sourceArtifactIds = handoff.sourceArtifactIds;
  const sourceRefs = handoff.sourceRefs;
  const allowedTools = handoff.allowedTools;
  if (!checkpoint || checkpoint.runId !== run.id || checkpoint.userId !== run.userId
    || handoff.runId !== run.id || targetAgentId !== run.agentId || !agent || !getAgentCard(targetAgentId)
    || !contract?.program || !frozenContract?.program || contract.taskType !== run.taskType || handoff.fromTask !== run.taskType
    || handoff.toTask !== run.taskType || handoff.goal !== contract.target || handoff.readBackVerified !== true
    || !Array.isArray(sourceArtifactIds) || sourceArtifactIds.some((id) => typeof id !== "string")
    || !Array.isArray(sourceRefs) || !Array.isArray(allowedTools) || !allowedTools.length
    || allowedTools.some((tool) => typeof tool !== "string" || !agent.toolNames.includes(tool)
      || frozenContract.routing?.allowedTools && !frozenContract.routing.allowedTools.includes(tool))) {
    throw new Error("持久化主责交接的身份、目标、来源或权限不一致");
  }
  const tightenedContract = constrainTaskContract(frozenContract, contract.routing?.intentConstraints || deriveIntentConstraints(""));
  if (stableJson(contract) !== stableJson(tightenedContract)) throw new Error("主责交接恢复只能收紧约束，不能更换目标或扩权");
  const messages = Array.isArray(checkpoint.context.conversationMessages) ? checkpoint.context.conversationMessages : [];
  const sourceMessage = messages.map(record).find((entry) => (entry.id || entry.itemId) === authorization.turnId && entry.role === "user");
  const verifiedAuthorization = readCollaborationAuthorization(sourceMessage ? [sourceMessage] : [], "handoff", targetAgentId, contract.target);
  if (stableJson(authorization) !== stableJson(verifiedAuthorization) || handoff.reason !== authorization.quote
    || !sourceArtifactIds.includes(authorization.turnId)
    || sourceArtifactIds.some((id) => id !== authorization.turnId && !sourceRefs.some((ref) => record(ref).id === id))
    || sourceRefs.some((ref) => !sourceArtifactIds.includes(record(ref).id)
      || !checkpoint.factRefs.some((current) => stableJson(current) === stableJson(ref)))) {
    throw new Error("持久化主责交接的授权或来源已变更");
  }
  const sourceContents = await readCollaborationSources(run, checkpoint, sourceRefs as AgentRunFactReference[]);
  const handoffId = "handoff-" + digest(stableJson({ runId: run.id, targetAgentId, goal: contract.target, authorization,
    sourceRefs, sourceContents, sourceArtifactIds, contract: frozenContract, allowedTools })).slice(0, 40);
  if (handoff.handoffId !== handoffId || stableJson(handoff.sourceContents) !== stableJson(sourceContents)
    || stableJson(handoff.constraints) !== stableJson(frozenContract.routing?.intentConstraints || {})) {
    throw new Error("持久化主责交接的冻结契约校验失败");
  }
  if (signal.aborted) throw new Error("主责交接恢复已取消");
  const completed = events.find((event) => event.type === "run.handoff_completed" && record(event.payload.handoff).handoffId === handoffId);
  if (completed && stableJson(completed.payload.handoff) !== stableJson(handoff)) throw new Error("主责交接审计与检查点不一致");
  if (!completed && repairAudit) await runtime.recordEvent({ runId: run.id, workerId: run.ownerId!,
    fencingToken: run.fencingToken, type: "run.handoff_completed", payload: { handoff } });
  return handoff;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
