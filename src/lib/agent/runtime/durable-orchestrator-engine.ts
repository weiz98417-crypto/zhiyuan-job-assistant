import { createHash, randomUUID } from "crypto";
import { orchestrateGen } from "@/lib/agent/orchestrator";
import type { SSEEvent } from "@/lib/agent/loop/types";
import type { ModelRecoveryPolicy } from "@/lib/agent/loop/types";
import type { InterviewSessionState } from "@/types";
import type { InterviewRebindResolution } from "@/lib/agent/interview-rebind-policy";
import type {
  DurableAgentRunService,
} from "@/lib/agent/runtime/durable-agent-run";
import type {
  AgentRunExecutionEngine,
  AgentRunExecutionResult,
} from "@/lib/agent/runtime/agent-worker";
import {
  compactExecutionConversation,
  loadExecutionConversation,
  parseInterviewState,
  reconcileExecutionRunGates,
  saveExecutionConversation,
  type ExecutionConversationMessage,
} from "@/lib/agent/runtime/execution-session-service";
import {
  RuntimeCircuitBreaker,
  sharedRuntimeCircuitBreaker,
} from "@/lib/agent/runtime/runtime-circuit-breaker";
import {
  inferCompletedCriteriaFromToolResult,
  resolveTaskContractRunOutcome,
  type AgentTaskContract,
} from "@/lib/agent/task-contract";
import { buildCareerPositioningFallback } from "@/lib/agent/career-positioning-result";
import { buildServerRunContextDirectives } from "@/lib/agent/runtime/server-run-context-directives";
import { buildContractForTask } from "@/lib/agent/run-admission";
import type { VerifiedActionResult } from "@/lib/agent/verified-action";
import { projectDurableUiEvent } from "@/lib/agent/runtime/run-event-projection";
import { inferJDResumeMatchingDirective } from "@/lib/agent/jd-resume-scope-intent";
import { projectToolResultForUser } from "@/lib/agent/surface-projection";
import {
  buildRunContext,
  type DurableRunContextSource,
  type RunContextMessage,
} from "@/lib/agent/runtime/run-context";

type Orchestrate = (input: {
  content: string;
  messages: ExecutionConversationMessage[];
  agentId: string;
  sessionId: number | null;
  userId: string;
  runId: string;
  workerId: string;
  fencingToken: number;
  taskContract: AgentTaskContract | null;
  modelRecovery?: ModelRecoveryPolicy;
  frozenToolCall?: { name: string; args: Record<string, unknown> };
  signal: AbortSignal;
  /** M1 gap closure: server-derived interview session state for the loop's tool policy. */
  interviewState?: InterviewSessionState;
  interviewRebindAction?: InterviewRebindResolution;
  /** Server-rebuilt prompt context sections (interview binding / rebind / guided). */
  promptContextInjection?: string;
}) => AsyncIterable<Record<string, unknown> & { type: string }>;

export interface DurableOrchestratorExecutionEngineOptions {
  runtime: DurableAgentRunService;
  loadConversation?: typeof loadExecutionConversation;
  saveConversation?: typeof saveExecutionConversation;
  orchestrate?: Orchestrate;
  circuitBreaker?: RuntimeCircuitBreaker;
  contextSource?: DurableRunContextSource;
}

interface StoredContractEvaluation {
  canClaimSuccess: boolean;
  completedCriteria: string[];
  unmetCriteria: string[];
  outcome: AgentRunExecutionResult["outcome"];
}

interface StoredModelCompletion {
  id: string;
  outcome: AgentRunExecutionResult["outcome"];
  charCount: number;
  toolResultCount: number;
  contractEvaluation?: StoredContractEvaluation;
  failure?: StoredToolFailure;
}

interface StoredToolFailure {
  toolName: string;
  message: string;
  category: string;
  recoverable: false;
}

export class DurableOrchestratorExecutionEngine implements AgentRunExecutionEngine {
  private readonly loadConversation: typeof loadExecutionConversation;
  private readonly saveConversation: typeof saveExecutionConversation;
  private readonly orchestrate: Orchestrate;
  private readonly circuitBreaker: RuntimeCircuitBreaker;
  private readonly contextSource: DurableRunContextSource;

  constructor(private readonly options: DurableOrchestratorExecutionEngineOptions) {
    this.loadConversation = options.loadConversation || loadExecutionConversation;
    this.saveConversation = options.saveConversation || saveExecutionConversation;
    this.orchestrate = options.orchestrate || defaultOrchestrate;
    this.circuitBreaker = options.circuitBreaker || sharedRuntimeCircuitBreaker;
    this.contextSource = options.contextSource || emptyRunContextSource;
  }

  async execute(input: Parameters<AgentRunExecutionEngine["execute"]>[0]): Promise<AgentRunExecutionResult> {
    const principal = { userId: input.run.userId };
    const pendingInputs = await this.options.runtime.listPendingInputs(principal, input.run.id);
    const durableMaterial = await this.contextSource.load(principal, input.run.id);
    const storedCompletion = readStoredModelCompletion(input.checkpoint?.context.modelCompletion);
    const recoveryAlreadyDecided = Object.keys(asRecord(input.checkpoint?.context.recovery)).length > 0;
    const resolvedGate = durableMaterial.gates.some((gate) => gate.status === "approved" || gate.status === "denied");
    const latestApprovedGate = storedCompletion?.outcome === "waiting_user"
      ? [...durableMaterial.gates].reverse().find((gate) => (
          gate.status === "approved"
          && gate.request
          && typeof gate.request.args === "object"
          && gate.request.args !== null
          && !Array.isArray(gate.request.args)
        ))
      : undefined;
    if (
      storedCompletion
      && pendingInputs.length === 0
      && !(storedCompletion.outcome === "failed" && recoveryAlreadyDecided)
      && !(storedCompletion.outcome === "waiting_user" && resolvedGate)
    ) {
      return this.finalizeStoredCompletion(input, storedCompletion);
    }
    const durableMessages = pendingInputs.map((item) => ({
      role: "user" as const,
      content: item.content.content,
      images: item.content.images ? [...item.content.images] : undefined,
      timestamp: item.createdAt,
    }));
    const originalContract = asTaskContract(input.run.contract);
    const checkpointMatchingScope = typeof input.checkpoint?.context.jdMatchResume === "boolean"
      ? input.checkpoint.context.jdMatchResume
      : undefined;
    const checkpointSourceKey = typeof input.checkpoint?.context.jdSourceKey === "string"
      ? input.checkpoint.context.jdSourceKey
      : latestJDSourceKey(runContextMessages(input.checkpoint?.context.messages));
    const jdScope = originalContract?.taskType === "jd_evaluation"
      ? resolveJDMatchingScope(durableMessages, checkpointSourceKey, checkpointMatchingScope ?? originalContract.routing?.jdMatchResume)
      : null;
    const jdMatchResume = jdScope?.matchResume;
    const jdSourceChanged = jdScope?.sourceChanged === true;
    const contextInputs = jdSourceChanged
      ? durableMessages.slice(jdScope.sourceStartIndex)
      : durableMessages;
    const safeContextInputs = jdMatchResume === false
      ? filterJDNoResumeMessages(contextInputs)
      : contextInputs;
    const effectiveContract = originalContract?.taskType === "jd_evaluation"
      ? {
          ...originalContract,
          ...(jdMatchResume === false
            ? { target: "仅评估当前 JD，不读取或匹配简历" }
            : jdSourceChanged ? { target: "评估当前用户提供的 JD" } : {}),
          routing: { ...originalContract.routing, jdMatchResume },
        }
      : input.run.contract;
    const durableConversationMessages = pendingInputs
      .filter((item) => item.content.persistInConversation !== false)
      .map((item) => ({
        role: "user" as const,
        content: item.content.content,
        images: item.content.images ? [...item.content.images] : undefined,
        timestamp: item.createdAt,
      }));
    const priorMessages = await this.loadConversation(principal, input.run.conversationId);
    const recovery = asRecord(input.checkpoint?.context.recovery);
    const recoveryObservation = asRecord(recovery.observation);
    const recoveryDecision = asRecord(recovery.decision);
    const modelRecovery: ModelRecoveryPolicy | undefined = recoveryDecision.action === "switch_provider"
      ? { switchProvider: true }
      : undefined;
    const recoveryMessages: RunContextMessage[] = Object.keys(recovery).length
      ? [{
          role: "system",
          content: `[RECOVERY action=${String(recoveryDecision.action || "safe_tool_replan")}] ${String(recoveryObservation.userSafeSummary || "上一次执行路径失败，请使用尚未尝试的安全方法继续原任务。")}`,
        }]
      : [];
    const checkpointMessages = (jdSourceChanged ? [] : runContextMessages(input.checkpoint?.context.messages))
      .filter((message) => !(message.role === "system" && message.content.startsWith("Durable Run Contract:")));
    const contextCheckpointMessages = jdMatchResume === false
      ? filterJDNoResumeMessages(checkpointMessages)
      : checkpointMessages;
    const contextConversationMessages = jdSourceChanged
      ? []
      : jdMatchResume === false
      ? filterJDNoResumeMessages(runContextMessages(priorMessages))
      : runContextMessages(priorMessages);
    const contextCompletedToolFacts = jdMatchResume === false || jdSourceChanged ? [] : durableMaterial.completedToolFacts;
    const contextRecoveryObservations = jdMatchResume === false || jdSourceChanged ? [] : durableMaterial.recoveryObservations;
    const contextEvidence = jdMatchResume === false || jdSourceChanged ? [] : durableMaterial.evidence;
    const rebuiltContext = buildRunContext({
      contract: effectiveContract,
      checkpoint: {
        messages: contextCheckpointMessages,
        plan: jdSourceChanged ? {} : input.checkpoint?.plan || {},
        factRefs: jdSourceChanged ? [] : input.checkpoint?.factRefs || [],
      },
      conversationMessages: contextConversationMessages,
      pendingInputs: [...(jdMatchResume === false || jdSourceChanged ? [] : recoveryMessages), ...safeContextInputs],
      completedToolFacts: contextCompletedToolFacts,
      recoveryObservations: contextRecoveryObservations,
      evidence: contextEvidence,
      gates: jdSourceChanged ? [] : durableMaterial.gates,
      factRefs: jdSourceChanged ? [] : durableMaterial.factRefs,
    });
    const messages: ExecutionConversationMessage[] = rebuiltContext.messages;
    const checkpointConversationMessages = executionConversationMessages(
      input.checkpoint?.context.conversationMessages,
    );
    const baseConversationMessages = checkpointConversationMessages.length > 0
      ? appendPendingConversationMessages(checkpointConversationMessages, durableConversationMessages)
      : [...priorMessages, ...durableConversationMessages];
    const conversationMessages = reconcileExecutionRunGates(baseConversationMessages, durableMaterial.gates);
    const forceCompaction = String(recoveryDecision.action || "") === "compact_context";
    const configuredContextLimit = Number(process.env.AGENT_CONTEXT_MAX_CHARS || 48_000);
    const contextLimit = forceCompaction
      ? Math.min(24_000, configuredContextLimit)
      : configuredContextLimit;
    const executionContext = compactExecutionConversation(messages, contextLimit);
    const latestDurableMessage = durableMessages.at(-1);
    const latestInput = latestDurableMessage?.content
      || (latestDurableMessage?.images?.length ? "请分析我刚才发送的图片。" : "")
      || String(input.checkpoint?.context.latestInput || "");
    if (!latestInput) throw new Error("Agent Run has no durable input to execute");
    const modelLatestInput = jdMatchResume === false
      ? safeContextInputs.at(-1)?.content || "请仅分析当前 JD；若缺少正文，请让我补充 JD 文字或截图。"
      : latestInput;

    await this.options.runtime.saveCheckpoint({
      runId: input.run.id,
      workerId: input.run.ownerId!,
      fencingToken: input.run.fencingToken,
      boundary: "before_model",
      context: {
        messages: executionContext.messages,
        conversationMessages,
        latestInput,
        jdMatchResume,
        jdSourceKey: jdScope?.sourceKey,
        compacted: executionContext.compacted,
        omittedMessageCount: executionContext.omittedCount,
        ...(Object.keys(recovery).length > 0 ? { recovery } : {}),
      },
      plan: rebuiltContext.plan,
      budgets: input.checkpoint?.budgets || input.run.budgets,
      factRefs: rebuiltContext.factRefs,
    });
    await this.saveConversation(principal, input.run.conversationId, conversationMessages).catch(() => undefined);
    await this.options.runtime.consumeInputs({
      runId: input.run.id,
      workerId: input.run.ownerId!,
      fencingToken: input.run.fencingToken,
      inputIds: pendingInputs.map((item) => item.id),
    });

    let assistantText = "";
    const projectedMessages: ExecutionConversationMessage[] = [];
    let pendingRecoverableFailure = "";
    let terminalToolFailure: StoredToolFailure | undefined;
    let waitingUserRequested = false;
    let hasUserVisibleArtifact = false;
    let latestSuccessfulToolResult: {
      name: string;
      result: string;
      success: true;
      data?: unknown;
    } | null = null;
    const completedCriteria = new Set<string>();
    let contract = asTaskContract(rebuiltContext.contract);
    // 0.11.0-A: the intent envelope is the first worker step. It may redirect
    // the run to the real task (in-run handoff via agent_switch) or turn an
    // ambiguous turn into a clarification contract; both are recorded as
    // events so the UI and the audit trail see the same decision.
    let envelopeAgentId: string | undefined;
    try {
      const { resolveIntentEnvelope } = await import("@/lib/agent/intent-envelope");
      const { taskAgentId: envelopeTaskAgentId } = await import("@/lib/agent/guided-session-state");
      const envelope = await resolveIntentEnvelope({
        content: latestInput,
        agentId: input.run.agentId || undefined,
      }).catch(() => undefined);
      if (envelope) {
        await this.options.runtime.recordEvent({
          runId: input.run.id,
          workerId: input.run.ownerId!,
          fencingToken: input.run.fencingToken,
          eventType: "run.ui_event",
          payload: {
            event: {
              type: "intent",
              agentId: envelope.envelope.primaryTask ? envelopeTaskAgentId(envelope.envelope.primaryTask) : undefined,
              audit: envelope.envelope.audit.join("|"),
              clarify: envelope.kind === "clarify",
            },
          },
        } as never);
        if (envelope.kind === "clarify" || !envelope.envelope.primaryTask) {
          contract = {
            ...buildContractForTask("general_chat", latestInput),
            successCriteria: ["clarification question asked"],
          };
        } else if (
          // Only a confident source may redirect the contract; the regex
          // fallback records its guess as audit but never mutates the run.
          (envelope.source === "llm" || envelope.source === "fast_path")
          && envelope.envelope.primaryTask !== contract?.taskType
          && envelope.envelope.confidence !== "low"
          && !(Array.isArray(contract?.successCriteria)
            && contract.successCriteria.includes("clarification question asked"))
        ) {
          contract = buildContractForTask(envelope.envelope.primaryTask, latestInput);
          envelopeAgentId = envelopeTaskAgentId(envelope.envelope.primaryTask);
        }
      }
    } catch {
      // Envelope failures must never block execution — the admitted contract stands.
    }
    // M1 gap closure: rebuild the interview/guided prompt context server-side
    // (previously assembled by the browser for the deleted legacy loop).
    // Forced non-interview agents skip interview binding, mirroring the old
    // client's explicitForcedAgentId bypass.
    const directives = await buildServerRunContextDirectives({
      principal,
      conversationId: input.run.conversationId,
      content: latestInput,
      bypassConversationLocks: input.run.agentId !== "interview",
    }).catch(() => undefined);
    const stream = this.orchestrate({
      content: modelLatestInput,
      messages: executionContext.messages,
      agentId: input.run.agentId,
      sessionId: input.run.conversationId,
      userId: input.run.userId,
      runId: input.run.id,
      workerId: input.run.ownerId!,
      fencingToken: input.run.fencingToken,
      taskContract: contract,
      modelRecovery,
      interviewState: directives?.interviewState,
      interviewRebindAction: directives?.interviewRebindAction || undefined,
      promptContextInjection: directives
        ? `${directives.interviewContext}${directives.rebindContext}${directives.guidedDirective}`
        : undefined,
      frozenToolCall: latestApprovedGate
        ? {
            name: String(latestApprovedGate.request?.toolName || latestApprovedGate.toolName),
            args: latestApprovedGate.request?.args as Record<string, unknown>,
          }
        : undefined,
      signal: input.signal,
    })[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await this.circuitBreaker.execute(
          "provider:orchestrator",
          () => stream.next(),
        );
        if (next.done) break;
        const event = next.value;
        if (input.signal.aborted) throw new Error("Agent execution cancelled");
        await this.options.runtime.recordEvent({
          runId: input.run.id,
          workerId: input.run.ownerId!,
          fencingToken: input.run.fencingToken,
          type: "run.ui_event",
          payload: { event: projectDurableUiEvent(event) },
        });
        if (event.type === "text") assistantText += String(event.content || "");
        if (event.type === "tool_result") {
          const safeView = projectToolResultForUser({
            toolName: String(event.name || ""),
            success: event.success === true,
            uiPayload: event.uiPayload && typeof event.uiPayload === "object" && !Array.isArray(event.uiPayload)
              ? event.uiPayload as Record<string, unknown>
              : undefined,
          });
          if (event.success === true) {
            pendingRecoverableFailure = "";
            hasUserVisibleArtifact ||= safeView.kind !== "silent";
            latestSuccessfulToolResult = {
              name: String(event.name || ""),
              result: String(event.result || ""),
              success: true,
              data: event.data,
            };
          }
          if (contract) {
            const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
            const criteria = inferCompletedCriteriaFromToolResult(contract, {
              toolName: String(event.name || ""),
              toolSuccess: event.success === true,
              data: event.data,
              uiPayload: event.uiPayload && typeof event.uiPayload === "object"
                ? event.uiPayload as Record<string, unknown>
                : undefined,
              verifiedAction: event.verifiedAction && typeof event.verifiedAction === "object"
                ? event.verifiedAction as VerifiedActionResult
                : undefined,
              readBackVerified: data.readBackVerified === true || data.reportReadBackVerified === true,
            });
            criteria.forEach((criterion) => completedCriteria.add(criterion));
          }
          if (safeView.kind !== "silent") {
            projectedMessages.push({
              role: "tool",
              content: safeView.summary,
              toolName: safeView.toolName,
              toolResult: safeView,
              timestamp: new Date().toISOString(),
            });
          }
        }
        if (
          event.type === "tool_error"
          && event.recoverable !== false
          && event.category !== "policy_denied"
        ) {
          pendingRecoverableFailure = String(event.error || "Tool execution failed");
        }
        if (event.type === "tool_error" && event.recoverable === false) {
          terminalToolFailure = {
            toolName: String(event.name || "tool"),
            message: String(event.error || "操作未能完成"),
            category: String(event.category || "permanent"),
            recoverable: false,
          };
        }
        if (event.type === "run_directive") {
          if (event.directive === "wait_user") waitingUserRequested = true;
          if (event.directive === "recover") {
            pendingRecoverableFailure = String(event.reason || "Tool execution requires recovery");
          }
        }
        if (event.type === "error") pendingRecoverableFailure = String(event.message || "Agent execution failed");
      }
    } catch (error) {
      const interruptedCheckpoint = await this.saveInterruptedOutput({
        input,
        assistantText,
        executionMessages: executionContext.messages,
        conversationMessages,
        latestInput,
        jdMatchResume,
        jdSourceKey: jdScope?.sourceKey,
        compacted: executionContext.compacted,
        omittedMessageCount: executionContext.omittedCount,
        plan: rebuiltContext.plan,
        factRefs: rebuiltContext.factRefs,
      }).catch(() => null);
      await this.options.runtime.recordEvent({
        runId: input.run.id,
        workerId: input.run.ownerId!,
        fencingToken: input.run.fencingToken,
        type: "run.model_output_interrupted",
        payload: interruptedEvidencePayload(assistantText, interruptedCheckpoint?.id),
      }).catch(() => undefined);
      throw error;
    }
    const careerPositioningFallback = contract?.taskType === "career_positioning_guidance"
      ? buildCareerPositioningFallback({
          messages: conversationMessages.flatMap((message) => (
            message.role === "user" || message.role === "assistant" || message.role === "tool"
              ? [{ role: message.role, content: message.content }]
              : []
          )),
          assistantText,
          toolResult: latestSuccessfulToolResult,
        })
      : null;
    if (careerPositioningFallback) assistantText = careerPositioningFallback;

    if (terminalToolFailure) pendingRecoverableFailure = "";
    if (pendingRecoverableFailure) {
      const interruptedCheckpoint = await this.saveInterruptedOutput({
        input,
        assistantText,
        executionMessages: executionContext.messages,
        conversationMessages,
        latestInput,
        jdMatchResume,
        jdSourceKey: jdScope?.sourceKey,
        compacted: executionContext.compacted,
        omittedMessageCount: executionContext.omittedCount,
        plan: rebuiltContext.plan,
        factRefs: rebuiltContext.factRefs,
      });
      await this.options.runtime.recordEvent({
        runId: input.run.id,
        workerId: input.run.ownerId!,
        fencingToken: input.run.fencingToken,
        type: "run.model_output_interrupted",
        payload: interruptedEvidencePayload(assistantText, interruptedCheckpoint.id),
      });
      throw new Error(pendingRecoverableFailure);
    }
    if (terminalToolFailure && !assistantText.trim()) {
      assistantText = `操作未能完成：${terminalToolFailure.message}`;
    }
    if (assistantText.trim()) {
      addAssistantCriteria(contract, completedCriteria);
    }
    const contractOutcome = contract
      ? resolveTaskContractRunOutcome(contract, Array.from(completedCriteria), {
          requiresClarification: waitingUserRequested || Boolean(
            contract.taskType !== "resume_diagnosis" && contract.routing?.requiresClarification
          ),
          hasAssistantResponse: Boolean(assistantText.trim()),
          hasUserVisibleArtifact,
        })
      : null;
    const recoveryActionAttempts = asRecord(input.checkpoint?.budgets.actionAttempts);
    const contractRecoveryExhausted = Number(recoveryActionAttempts.safe_tool_replan || 0) >= 2;
    const contractNoticeRequired = Boolean(
      contractOutcome?.safeMessage
      && !terminalToolFailure
      && (
        (contractOutcome.status === "waiting_user" && contractOutcome.replaceAssistantMessage)
        || (contractOutcome.status === "failed" && contractRecoveryExhausted)
      ),
    );
    const contractRecoveryPending = contractOutcome?.status === "failed"
      && !terminalToolFailure
      && !contractNoticeRequired;
    if ((contractNoticeRequired || terminalToolFailure && contractOutcome?.replaceAssistantMessage) && contractOutcome?.safeMessage) {
      assistantText = contractOutcome.safeMessage;
    } else if (contractOutcome?.status === "waiting_user" && !assistantText.trim() && contractOutcome.safeMessage) {
      assistantText = contractOutcome.safeMessage;
    }
    if (assistantText.trim() && !contractRecoveryPending) {
      projectedMessages.push({
        role: "assistant",
        content: assistantText,
        timestamp: new Date().toISOString(),
      });
    }
    const completedConversationMessages = contractRecoveryPending
      ? conversationMessages
      : [...conversationMessages, ...projectedMessages];
    const completedRunContext = compactExecutionConversation([
      ...executionContext.messages,
      ...projectedMessages.map(({ role, content, images, toolName, timestamp }) => ({
        role,
        content,
        images,
        toolName,
        timestamp,
      })),
    ], contextLimit);
    const completion: StoredModelCompletion = {
      id: randomUUID(),
      outcome: terminalToolFailure
        ? "failed"
        : contractNoticeRequired
          ? "waiting_user"
          : contractOutcome?.status
        || (waitingUserRequested
          ? "waiting_user"
          : assistantText.trim() || projectedMessages.length > 0 ? "succeeded" : "failed"),
      charCount: contractRecoveryPending ? 0 : assistantText.length,
      toolResultCount: contractRecoveryPending ? 0 : projectedMessages.filter((message) => message.role === "tool").length,
      failure: terminalToolFailure,
      contractEvaluation: contractOutcome
        ? {
            canClaimSuccess: contractOutcome.gate.canClaimSuccess,
            completedCriteria: contractOutcome.gate.completedCriteria,
            unmetCriteria: contractOutcome.gate.unmetCriteria,
            outcome: contractNoticeRequired ? "waiting_user" : contractOutcome.status,
          }
        : undefined,
    };
    await this.options.runtime.saveCheckpoint({
      runId: input.run.id,
      workerId: input.run.ownerId!,
      fencingToken: input.run.fencingToken,
      boundary: "after_model",
      context: {
        messages: completedRunContext.messages,
        conversationMessages: completedConversationMessages,
        latestInput,
        jdMatchResume,
        jdSourceKey: jdScope?.sourceKey,
        compacted: completedRunContext.compacted,
        omittedMessageCount: completedRunContext.omittedCount,
        modelCompletion: completion,
      },
      plan: rebuiltContext.plan,
      budgets: input.checkpoint?.budgets || input.run.budgets,
      factRefs: rebuiltContext.factRefs,
    });
    return this.finalizeStoredCompletion(input, completion, completedConversationMessages);
  }

  private async saveInterruptedOutput(input: {
    input: Parameters<AgentRunExecutionEngine["execute"]>[0];
    assistantText: string;
    executionMessages: ExecutionConversationMessage[];
    conversationMessages: ExecutionConversationMessage[];
    latestInput: string;
    jdMatchResume?: boolean;
    jdSourceKey?: string;
    compacted: boolean;
    omittedMessageCount: number;
    plan: Record<string, unknown>;
    factRefs: Parameters<DurableAgentRunService["saveCheckpoint"]>[0]["factRefs"];
  }) {
    return this.options.runtime.saveCheckpoint({
      runId: input.input.run.id,
      workerId: input.input.run.ownerId!,
      fencingToken: input.input.run.fencingToken,
      boundary: "model_interrupted",
      context: {
        messages: input.executionMessages,
        conversationMessages: input.conversationMessages,
        latestInput: input.latestInput,
        jdMatchResume: input.jdMatchResume,
        jdSourceKey: input.jdSourceKey,
        compacted: input.compacted,
        omittedMessageCount: input.omittedMessageCount,
        interruptedModelOutput: {
          id: randomUUID(),
          text: input.assistantText,
          charCount: input.assistantText.length,
          capturedAt: new Date().toISOString(),
        },
      },
      plan: input.plan,
      budgets: input.input.checkpoint?.budgets || input.input.run.budgets,
      factRefs: input.factRefs,
    });
  }

  private async finalizeStoredCompletion(
    input: Parameters<AgentRunExecutionEngine["execute"]>[0],
    completion: StoredModelCompletion,
    conversationMessages = executionConversationMessages(input.checkpoint?.context.conversationMessages),
  ): Promise<AgentRunExecutionResult> {
    const principal = { userId: input.run.userId };
    const events = await this.options.runtime.listEvents(principal, input.run.id, 0);
    const completionRecorded = events.some((event) => (
      event.type === "run.model_output_complete"
      && event.payload.completionId === completion.id
    ));
    if (!completionRecorded) {
      await this.options.runtime.recordEvent({
        runId: input.run.id,
        workerId: input.run.ownerId!,
        fencingToken: input.run.fencingToken,
        type: "run.model_output_complete",
        payload: {
          completionId: completion.id,
          charCount: completion.charCount,
          toolResultCount: completion.toolResultCount,
        },
      });
    }
    if (completion.contractEvaluation) {
      const contractRecorded = events.some((event) => (
        event.type === "run.contract_evaluated"
        && event.payload.completionId === completion.id
      ));
      if (!contractRecorded) {
        await this.options.runtime.recordEvent({
          runId: input.run.id,
          workerId: input.run.ownerId!,
          fencingToken: input.run.fencingToken,
          type: "run.contract_evaluated",
          payload: {
            completionId: completion.id,
            ...completion.contractEvaluation,
          },
        });
      }
      if (completion.contractEvaluation.outcome === "failed") {
        await this.saveConversation(principal, input.run.conversationId, conversationMessages);
        if (completion.failure) {
          return { outcome: "failed", failure: permanentToolObservation(completion.failure) };
        }
        throw new Error(`Run Contract unmet: ${completion.contractEvaluation.unmetCriteria.join(", ")}`);
      }
    }
    await this.saveConversation(principal, input.run.conversationId, conversationMessages);
    return {
      outcome: completion.outcome,
      ...(completion.failure ? { failure: permanentToolObservation(completion.failure) } : {}),
    };
  }
}

function asTaskContract(value: unknown): AgentTaskContract | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.taskType !== "string"
    || !Array.isArray(record.successCriteria)
    || !Array.isArray(record.validators)
  ) return null;
  return value as AgentTaskContract;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolveJDMatchingScope(
  messages: Array<{ content: string; images?: string[] }>,
  previousSourceKey: string | undefined,
  previousMatchResume: boolean | undefined,
): { sourceKey?: string; matchResume?: boolean; sourceChanged: boolean; sourceStartIndex: number } {
  let sourceKey = previousSourceKey;
  let matchResume = previousMatchResume;
  let sourceChanged = false;
  let sourceStartIndex = 0;
  for (const [index, message] of messages.entries()) {
    const nextSourceKey = jdSourceKeyForMessage(message);
    if (nextSourceKey) {
      if (sourceKey && nextSourceKey !== sourceKey) {
        matchResume = undefined;
        sourceChanged = true;
        sourceStartIndex = index;
      }
      sourceKey = nextSourceKey;
    }
    const directive = inferJDResumeMatchingDirective(message.content);
    if (directive !== undefined) matchResume = directive;
  }
  return { sourceKey, matchResume, sourceChanged, sourceStartIndex };
}

function latestJDSourceKey(messages: RunContextMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== "user") continue;
    const sourceKey = jdSourceKeyForMessage(messages[index]);
    if (sourceKey) return sourceKey;
  }
  return undefined;
}

function jdSourceKeyForMessage(message: { content: string; images?: string[] }): string | undefined {
  const images = (message.images || []).filter((image) => image.startsWith("data:image/"));
  if (images.length > 0) return `image:${hashJDSource(images.join("\n"))}`;
  const jdId = message.content.match(/\bjdId\s*[=:：]\s*(\d+)/i)?.[1];
  if (jdId) return `id:${jdId}`;
  // 0.11.0-A: detection runs on the original text (structure regexes need
  // spacing/punctuation); only the identity hash is normalized so the same JD
  // retyped with different whitespace/punctuation/casing keeps its preference.
  const rawText = message.content.replace(/\s+/g, " ").trim();
  const identityText = rawText
    .replace(/[\s，。；！？、,:：;；!！?？]+/g, "")
    .toLowerCase();
  const urlMatch = /https?:\/\/[^\s)）]+/i.exec(rawText);
  if (urlMatch) {
    const url = urlMatch[0];
    const urlIntroducedAsJD = /(?:\bJD\b|岗位|职位|招聘|job|position)(?:信息|发布)?(?:链接|地址|网址|页面|url)?\s*[:：]\s*$/i.test(rawText.slice(0, urlMatch.index));
    const jobPostingUrl = /\/(?:jobs?|job_detail|positions?|careers?)(?:[/?#_-]|$)|[?&](?:jobid|jdId|positionId)=/i.test(url);
    if (rawText === url || urlIntroducedAsJD || jobPostingUrl) {
      return `url:${hashJDSource(url.replace(/[.,，。；;!?！?]+$/, "").toLowerCase())}`;
    }
  }
  if (rawText.length < 50) return undefined;
  const hasJDStructure = /(?:\bJD\b|岗位职责|任职要求|职位描述|工作内容|招聘要求|工作职责|岗位要求|job description|responsibilit(?:y|ies)|requirements?|qualifications?|about the role)\s*[:：]|(?:岗位职责|任职要求|职位描述|工作内容|招聘要求|工作职责|岗位要求)\s*是(?!否|不)|we are hiring|you will be responsible/i.test(rawText);
  if (!hasJDStructure) return undefined;
  return `text:${hashJDSource(identityText)}`;
}

function hashJDSource(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function filterJDNoResumeMessages(messages: RunContextMessage[]): RunContextMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "assistant") {
      const isJDAnalysis = /\bJD\b|岗位|职位|招聘|任职|工作内容|job description|responsibilit|requirement|qualification|hiring|\brole\b/i.test(message.content);
      const includesPersonalContext = /简历|履历|\bcv\b|\bresume\b|匹配|适配|契合|对照|比较|候选人|求职者|(?:你|您|我|本人|个人).{0,12}(?:经历|背景|能力|经验|项目|学历|工作)|手机号|手机|电话|邮箱|身份证|学校|毕业|项目经历|工作经历|实习|姓名|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b1[3-9]\d{9}\b/i.test(message.content);
      return isJDAnalysis && !includesPersonalContext ? [{ ...message, images: undefined }] : [];
    }
    if (message.role !== "user") return [];
    const resumeContent = /(?:我的|本人|个人)?(?:简历|履历|\bcv\b|\bresume\b)\s*(?:内容|如下|全文|文本|信息)?\s*[:：]/i.exec(message.content);
    if (!resumeContent) return [message];
    const beforeResume = message.content.slice(0, resumeContent.index);
    const afterResume = message.content.slice(resumeContent.index + resumeContent[0].length);
    const laterJD = /(?:\bJD\b|job description|职位描述)\s*[:：]/i.exec(afterResume);
    const jdOnly = [beforeResume, laterJD ? afterResume.slice(laterJD.index) : ""]
      .filter((part) => /\bJD\b|job description|岗位职责|任职要求|职位描述|responsibilities|requirements|qualifications/i.test(part))
      .join("\n")
      .trim();
    return jdOnly ? [{ ...message, content: jdOnly, images: undefined }] : [];
  });
}

function readStoredModelCompletion(value: unknown): StoredModelCompletion | null {
  const record = asRecord(value);
  const outcome = String(record.outcome || "");
  if (
    typeof record.id !== "string"
    || !["succeeded", "waiting_user", "failed"].includes(outcome)
  ) return null;
  const contractRecord = asRecord(record.contractEvaluation);
  const contractOutcome = String(contractRecord.outcome || "");
  const contractEvaluation = ["succeeded", "waiting_user", "failed"].includes(contractOutcome)
    ? {
        canClaimSuccess: contractRecord.canClaimSuccess === true,
        completedCriteria: stringArray(contractRecord.completedCriteria),
        unmetCriteria: stringArray(contractRecord.unmetCriteria),
        outcome: contractOutcome as AgentRunExecutionResult["outcome"],
      }
    : undefined;
  return {
    id: record.id,
    outcome: outcome as AgentRunExecutionResult["outcome"],
    charCount: safeCount(record.charCount),
    toolResultCount: safeCount(record.toolResultCount),
    contractEvaluation,
    failure: readStoredToolFailure(record.failure),
  };
}

function readStoredToolFailure(value: unknown): StoredToolFailure | undefined {
  const record = asRecord(value);
  if (!record.toolName || !record.message || record.recoverable !== false) return undefined;
  return {
    toolName: String(record.toolName),
    message: String(record.message),
    category: String(record.category || "permanent"),
    recoverable: false,
  };
}

function permanentToolObservation(failure: StoredToolFailure) {
  const normalized = failure.message.toLowerCase().replace(/\d+/g, "#").slice(0, 120);
  return {
    category: "tool_permanent" as const,
    stage: "tool_execution",
    retryability: "never" as const,
    effectState: "not_executed" as const,
    fingerprint: `tool_permanent:${failure.toolName}:${normalized}`,
    userSafeSummary: failure.message,
    diagnosticRef: failure.toolName,
    recoveryCapabilities: [],
  };
}

function interruptedEvidencePayload(text: string, checkpointId?: number): Record<string, unknown> {
  return {
    charCount: text.length,
    ...(checkpointId ? { payloadCheckpointId: checkpointId } : {}),
  };
}

function safeCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function runContextMessages(value: unknown): RunContextMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const message = asRecord(item);
    const role = String(message.role || "");
    if (!["system", "user", "assistant", "tool"].includes(role) || typeof message.content !== "string") return [];
    const images = Array.isArray(message.images)
      ? message.images.filter((image): image is string => typeof image === "string")
      : undefined;
    return [{
      role: role as RunContextMessage["role"],
      content: message.content,
      images,
    }];
  });
}

function executionConversationMessages(value: unknown): ExecutionConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const message = asRecord(item);
    if (typeof message.role !== "string" || typeof message.content !== "string") return [];
    const images = Array.isArray(message.images)
      ? message.images.filter((image): image is string => typeof image === "string")
      : undefined;
    return [{
      role: message.role,
      content: message.content,
      images,
      toolName: typeof message.toolName === "string" ? message.toolName : undefined,
      toolResult: message.toolResult,
      timestamp: typeof message.timestamp === "string" ? message.timestamp : undefined,
    }];
  });
}

function appendPendingConversationMessages(
  conversationMessages: ExecutionConversationMessage[],
  pendingMessages: ExecutionConversationMessage[],
): ExecutionConversationMessage[] {
  const existing = new Set(conversationMessages.map((message) => JSON.stringify([
    message.role,
    message.content,
    message.images || [],
    message.timestamp,
  ])));
  const appended = [...conversationMessages];
  for (const message of pendingMessages) {
    const key = JSON.stringify([message.role, message.content, message.images || [], message.timestamp]);
    if (existing.has(key)) continue;
    existing.add(key);
    appended.push(message);
  }
  return appended;
}

const emptyRunContextSource: DurableRunContextSource = {
  load: async () => ({ completedToolFacts: [], recoveryObservations: [], evidence: [], gates: [], factRefs: [] }),
};

function addAssistantCriteria(contract: AgentTaskContract | null, completed: Set<string>): void {
  if (!contract) return;
  if (contract.taskType === "general_chat") completed.add("answer generated");
  if (contract.taskType === "resume_query") completed.add("answer generated");
  if (contract.taskType === "resume_diagnosis") completed.add("answer generated");
  if (contract.taskType === "career_positioning_guidance") {
    completed.add("next question or guidance response generated");
  }
  if (contract.taskType === "interview_coaching") {
    completed.add("one question generated");
  }
}

function defaultOrchestrate(input: Parameters<Orchestrate>[0]): AsyncIterable<SSEEvent & { type: string }> {
  return orchestrateGen(input.content, {
    sessionId: input.sessionId,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
      images: message.images ? [...message.images] : undefined,
    })),
    signal: input.signal,
    principal: { userId: input.userId },
    runId: input.runId,
    workerId: input.workerId,
    fencingToken: input.fencingToken,
    taskContract: input.taskContract,
    modelRecovery: input.modelRecovery,
    frozenToolCall: input.frozenToolCall,
    durable: true,
    forcedAgentId: input.agentId,
    interviewState: input.interviewState,
    interviewRebindAction: input.interviewRebindAction?.action,
    promptContextInjection: input.promptContextInjection,
  });
}
