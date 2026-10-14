import { createHash } from "crypto";
import { validateDelegation } from "@/lib/agent/agent-collaboration";
import type { ToolExecutionContext, ToolResult } from "@/lib/agent/tools/types";
import type { AgentRunFactReference, AgentRunSnapshot, DurableAgentRunService } from "@/lib/agent/runtime/durable-agent-run";
import { readCollaborationSources, type CollaborationSourceContent } from "@/lib/agent/runtime/collaboration-sources";
import { getTaskProgram } from "@/lib/agent/task-program";
import type { AgentTaskContract } from "@/lib/agent/task-contract";
import { readCollaborationAuthorization } from "@/lib/agent/runtime/collaboration-authorization";

export interface ResearchDelegationContract {
  kind: "governed-research/v1";
  delegationId: string;
  parentRunId: string;
  targetAgentId: string;
  purpose: string;
  dependency: "required" | "supporting";
  authorization: { turnId: string; quote: string; hash: string };
  sourceArtifactIds: string[];
  sourceRefs: AgentRunFactReference[];
  sourceContents: CollaborationSourceContent[];
  allowedTools: string[];
  outputSchema: "research-findings/v1";
  constraints: { readOnly: true; noUserInteraction: true; noPersonalMemoryWrite: true };
}

export interface ResearchFindings {
  schema: "research-findings/v1";
  findings: string;
  keyPoints: string[];
  sourceArtifactIds: string[];
  limitations: string[];
}

export class ResearchDelegationService {
  constructor(private readonly runtime: DurableAgentRunService, private readonly waitMs = 20_000) {}

  async prepare(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ResearchDelegationContract> {
    const parent = await this.runtime.getRun(context.principal, context.runId);
    assertCurrentWorker(parent, context);
    const targetAgentId = String(params.target_agent_id || "");
    const validation = validateDelegation({ targetAgentId, agentAllowlist: [...context.allowlist] });
    if (!validation.allowed || validation.effectiveTools.length === 0) throw new Error(validation.reason || "委派目标没有可用的只读研究工具");
    const contractTools = record(record(parent!.contract).routing).allowedTools;
    if (contractTools !== undefined && (!Array.isArray(contractTools)
      || validation.effectiveTools.some((tool) => !contractTools.includes(tool)))) {
      throw new Error("研究工具超过父 Run Contract 允许范围");
    }
    const checkpoint = await this.runtime.getLatestCheckpoint(context.principal, context.runId);
    const messages = Array.isArray(checkpoint?.context.conversationMessages) ? checkpoint.context.conversationMessages : [];
    const purpose = typeof params.goal === "string" ? params.goal.trim() : "";
    const authorization = readCollaborationAuthorization(messages, "research", targetAgentId, purpose);
    const { turnId, quote } = authorization;
    const parentContract = parent!.contract as AgentTaskContract;
    const program = getTaskProgram(parentContract.taskType);
    if (!program || parentContract.program?.id !== program.id || parentContract.program.version !== program.version) {
      throw new Error("研究委派缺少权威 Program 绑定");
    }
    const optionalAuthorized = /(?:可选|辅助|补充|optional|supporting).{0,20}(?:研究|委派|委托|research|delegate)/i.test(quote);
    const dependency = program.researchDependency === "supporting" && optionalAuthorized && params.dependency !== "required" ? "supporting" : "required";
    if (params.dependency !== undefined && params.dependency !== dependency) throw new Error("研究依赖等级必须符合 Program 和用户授权，不能由模型降级");
    const availableRefs = checkpoint?.factRefs || [];
    const requested = params.source_artifact_ids;
    if (requested !== undefined && (!Array.isArray(requested) || requested.some((value) => typeof value !== "string"))) throw new Error("研究来源必须是已绑定材料的 ID 集合");
    const sourceArtifactIds = [...new Set([turnId, ...((requested === undefined ? availableRefs.map((ref) => ref.id) : requested) as string[])])].sort();
    if (sourceArtifactIds.some((id) => id !== turnId && !availableRefs.some((source) => source.id === id))) throw new Error("研究来源不属于当前 Run 已绑定材料");
    const sourceRefs = availableRefs.filter((source) => sourceArtifactIds.includes(source.id));
    if (!checkpoint) throw new Error("研究委派缺少来源检查点");
    const sourceContents = await readCollaborationSources(parent!, checkpoint, sourceRefs);
    const delegationId = "dlg-" + digest(stableJson({ parentRunId: parent!.id, targetAgentId, purpose, dependency,
      authorization, sourceArtifactIds, sourceRefs, sourceContents, allowedTools: validation.effectiveTools })).slice(0, 40);
    return { kind: "governed-research/v1", delegationId, parentRunId: parent!.id, targetAgentId, purpose, dependency,
      authorization, sourceArtifactIds, sourceRefs, sourceContents, allowedTools: validation.effectiveTools, outputSchema: "research-findings/v1",
      constraints: { readOnly: true, noUserInteraction: true, noPersonalMemoryWrite: true } };
  }

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    if (!context.allowlist.includes("delegate_research")) return { success: false, data: null,
      error: "当前 Run 未授权研究委派工具", errorCategory: "policy_denied", recoverable: false };
    let contract: ResearchDelegationContract;
    try { contract = await this.prepare(params, context); }
    catch (error) { return { success: false, data: null, error: message(error), errorCategory: "policy_denied", recoverable: false }; }
    let childId: string | undefined;
    try {
      if (context.signal?.aborted) throw new Error("研究委派已取消");
      const child = await this.runtime.createRun(context.principal, { requestId: contract.delegationId, conversationId: null,
        taskType: "delegated_research", agentId: contract.targetAgentId, input: { content: contract.purpose, persistInConversation: false },
        contract, parentRunId: context.runId, runtimeMode: "worker_readonly" });
      childId = child.run.id;
      if (stableJson(child.run.contract) !== stableJson(contract) || child.run.parentRunId !== context.runId) throw new Error("委派重放的来源契约不一致");
      const deadline = Date.now() + this.waitMs;
      while (Date.now() < deadline) {
        assertCurrentWorker(await this.runtime.getRun(context.principal, context.runId), context);
        if (context.signal?.aborted) throw new Error("研究委派已取消");
        const current = await this.runtime.getRun(context.principal, childId);
        if (!current || current.parentRunId !== context.runId) throw new Error("委派子 Run 的归属不一致");
        if (current.status === "succeeded") {
          const checkpoint = await this.runtime.getLatestCheckpoint(context.principal, childId);
          const findings = parseResearchFindings(checkpoint?.context.researchFindings, contract);
          const data = { delegationId: contract.delegationId, childRunId: childId, targetAgentId: contract.targetAgentId,
            purpose: contract.purpose, dependency: contract.dependency,
            constraints: contract.constraints, state: "completed", ...findings, readBackVerified: true };
          return { success: true, data, llmSummary: JSON.stringify(data), errorCategory: "ok", uiPayload: {
            type: "delegation", ...data, agentId: contract.targetAgentId, goal: contract.purpose } };
        }
        if (["failed", "cancelled", "cancel_requested", "waiting_user", "paused"].includes(current.status)) {
          const checkpoint = await this.runtime.getLatestCheckpoint(context.principal, childId);
          throw new Error(typeof checkpoint?.context.researchFailure === "string" ? checkpoint.context.researchFailure : "研究子任务未完成");
        }
        await delay(50, context.signal);
      }
      throw new Error("研究子任务等待超时，尚未完成");
    } catch (error) {
      if (childId) await this.runtime.requestCancel(context.principal, childId, contract.delegationId + ":cancel").catch(() => undefined);
      const limitation = `研究「${contract.purpose}」未完成：${message(error)}。${contract.dependency === "required" ? "主任务等待恢复，不能声称已完成。" : "本次结论缺少这项辅助研究。"}`;
      const data = { delegationId: contract.delegationId, childRunId: childId, targetAgentId: contract.targetAgentId,
        purpose: contract.purpose, dependency: contract.dependency, sourceArtifactIds: contract.sourceArtifactIds,
        constraints: contract.constraints, state: "failed", limitation };
      return { success: false, data, error: limitation, errorCategory: contract.dependency === "required" ? "need_user_input" : "policy_denied",
        recoverable: contract.dependency === "supporting", llmSummary: limitation,
        uiPayload: { type: "delegation", ...data, agentId: contract.targetAgentId, goal: contract.purpose } };
    }
  }
}

export function parseResearchFindings(value: unknown, contract: ResearchDelegationContract): ResearchFindings {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); }
    catch { throw new Error("研究结果不是完整的结构化 JSON"); }
  }
  const result = record(parsed);
  if (result.schema !== contract.outputSchema || typeof result.findings !== "string" || !result.findings.trim() || result.findings.length > 2_400
    || !stringArray(result.keyPoints, 5, 400) || !stringArray(result.limitations, 10, 400)
    || !stringArray(result.sourceArtifactIds, 30, 180) || result.sourceArtifactIds.length === 0
    || result.sourceArtifactIds.some((id) => !contract.sourceArtifactIds.includes(id))) {
    throw new Error("研究结果未满足结构化输出与来源契约");
  }
  return { schema: "research-findings/v1", findings: result.findings.trim(), keyPoints: result.keyPoints,
    sourceArtifactIds: result.sourceArtifactIds, limitations: result.limitations };
}

export function assertCurrentWorker(run: AgentRunSnapshot | null, context: ToolExecutionContext): void {
  if (!run || !context.workerId || run.ownerId !== context.workerId || run.fencingToken !== context.fencingToken
    || !["running", "recovering"].includes(run.status) || !run.leaseExpiresAt || new Date(run.leaseExpiresAt).getTime() <= Date.now()) {
    throw new Error("研究协作需要有效的当前 Worker 归属和 fencing token");
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function message(error: unknown): string { return error instanceof Error ? error.message : "研究协作失败"; }
function stringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string" && item.trim() && item.length <= maxLength);
}
function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
  });
}
