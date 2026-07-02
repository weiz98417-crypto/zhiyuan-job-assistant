import type { AgentRunFailureType } from "@/lib/agent/run-review";

export type AgentRepairActionType =
  | "retry_transient"
  | "rerun_image_intake"
  | "ask_clarification"
  | "rollback_partial_write"
  | "resume_guided_task"
  | "correct_success_claim"
  | "create_eval_candidate"
  | "needs_engineering"
  | "noop";

export type AgentRepairOutcomeStatus =
  | "repairing"
  | "waiting_user"
  | "recovered"
  | "failed"
  | "rolled_back"
  | "needs_engineering";

export interface AgentRepairContext {
  failureType: AgentRunFailureType;
  taskType?: string;
  agentId?: string;
  hasOriginalImage?: boolean;
  imageQuality?: "clear" | "blurred" | "thumbnail" | "unreadable" | "unknown" | string;
  hasReadBackEvidence?: boolean;
  hasPartialWrite?: boolean;
  activeTaskType?: string;
  activeAgentId?: string;
  assistantClaimedSuccess?: boolean;
  transientProviderError?: boolean;
  attempts?: number;
}

export interface AgentRepairPlan {
  action: AgentRepairActionType;
  status: AgentRepairOutcomeStatus;
  maxAttempts: number;
  requiresUserInput: boolean;
  requiresReadBack: boolean;
  createEvalCandidate: boolean;
  reason: string;
  userMessage?: string;
  engineeringSuggestion?: string;
}

const DEFAULT_MAX_ATTEMPTS = 2;

export function planAgentRepair(context: AgentRepairContext): AgentRepairPlan {
  const attempts = Math.max(0, Math.floor(context.attempts || 0));
  if (attempts >= DEFAULT_MAX_ATTEMPTS) {
    return needsEngineering(context, "修复尝试已达到上限，需要工程排查。");
  }

  if (context.transientProviderError) {
    return {
      action: "retry_transient",
      status: "repairing",
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      requiresUserInput: false,
      requiresReadBack: requiresReadBack(context),
      createEvalCandidate: false,
      reason: "检测到可能是临时服务/供应商错误，允许有限重试。",
    };
  }

  if (context.failureType === "image_intake_not_called" || context.failureType === "image_intake_failure") {
    if (context.hasOriginalImage && context.imageQuality !== "thumbnail" && context.imageQuality !== "unreadable") {
      return {
        action: "rerun_image_intake",
        status: "repairing",
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        requiresUserInput: false,
        requiresReadBack: false,
        createEvalCandidate: true,
        reason: "图片原件仍可用，先补跑图片识别/分类。",
      };
    }
    return {
      action: "ask_clarification",
      status: "waiting_user",
      maxAttempts: 1,
      requiresUserInput: true,
      requiresReadBack: false,
      createEvalCandidate: true,
      reason: "图片质量不足或只剩缩略图，不能安全自动重试。",
      userMessage: "这张图无法稳定识别。请上传原始清晰截图，或直接粘贴 JD / Offer / 简历文本。",
    };
  }

  if (context.failureType === "image_intake_conflict_ignored" || context.failureType === "user_intent_unresolved") {
    return {
      action: "ask_clarification",
      status: "waiting_user",
      maxAttempts: 1,
      requiresUserInput: true,
      requiresReadBack: false,
      createEvalCandidate: true,
      reason: "用户意图和材料类型不一致，需要先问一个确认问题。",
      userMessage: "我需要先确认：这次你要按 JD、Offer、简历，还是普通图片内容来处理？",
    };
  }

  if (context.failureType === "guided_task_drift" || context.failureType === "wrong_task_routed") {
    return {
      action: "resume_guided_task",
      status: "repairing",
      maxAttempts: 1,
      requiresUserInput: false,
      requiresReadBack: false,
      createEvalCandidate: true,
      reason: "当前会话仍有活动引导任务，应该恢复到原任务 agent。",
      userMessage: "刚才任务路由跑偏了，我会回到当前引导任务继续推进。",
    };
  }

  if (
    context.failureType === "missing_readback" ||
    context.failureType === "partial_write" ||
    context.failureType === "tool_contract_mismatch"
  ) {
    if (context.hasPartialWrite) {
      return {
        action: "rollback_partial_write",
        status: "rolled_back",
        maxAttempts: 1,
        requiresUserInput: false,
        requiresReadBack: true,
        createEvalCandidate: true,
        reason: "检测到可能存在部分写入，必须先回滚或人工对账。",
        engineeringSuggestion: "检查事务边界和读回校验，确保写入失败不会留下孤儿记录。",
      };
    }
    if (context.assistantClaimedSuccess) {
      return {
        action: "correct_success_claim",
        status: "failed",
        maxAttempts: 1,
        requiresUserInput: false,
        requiresReadBack: true,
        createEvalCandidate: true,
        reason: "助手声称成功，但缺少读回/契约证据，必须纠正成功话术。",
        userMessage: "这次没有可靠保存成功证据，我不会把它算作已完成。",
      };
    }
    return needsEngineering(context, "高风险写入缺少可靠读回证据，需要工程排查。");
  }

  if (context.failureType === "tool_failed_but_message_success") {
    return {
      action: "correct_success_claim",
      status: "failed",
      maxAttempts: 1,
      requiresUserInput: false,
      requiresReadBack: requiresReadBack(context),
      createEvalCandidate: true,
      reason: "工具失败后助手仍然成功承诺，需要纠正用户可见结果。",
    };
  }

  if (context.failureType === "missing_run") {
    return {
      action: "create_eval_candidate",
      status: "needs_engineering",
      maxAttempts: 0,
      requiresUserInput: false,
      requiresReadBack: false,
      createEvalCandidate: true,
      reason: "工具型任务没有 durable run，只能先沉淀为工程改进项。",
      engineeringSuggestion: "在工具型业务 turn 进入 agent loop 前创建 durable run，失败时写 session anomaly。",
    };
  }

  return needsEngineering(context, "没有安全自动修复策略，转工程处理。");
}

export function serializeRepairPlanForLedger(plan: AgentRepairPlan): Record<string, unknown> {
  return {
    action: plan.action,
    status: plan.status,
    maxAttempts: plan.maxAttempts,
    requiresUserInput: plan.requiresUserInput,
    requiresReadBack: plan.requiresReadBack,
    createEvalCandidate: plan.createEvalCandidate,
    reason: plan.reason,
    userMessage: plan.userMessage,
    engineeringSuggestion: plan.engineeringSuggestion,
  };
}

function needsEngineering(context: AgentRepairContext, reason: string): AgentRepairPlan {
  return {
    action: "needs_engineering",
    status: "needs_engineering",
    maxAttempts: 0,
    requiresUserInput: false,
    requiresReadBack: requiresReadBack(context),
    createEvalCandidate: true,
    reason,
    engineeringSuggestion: "创建或更新 OpenSpec change，并补充 regression eval 后再放行。",
  };
}

function requiresReadBack(context: AgentRepairContext): boolean {
  return /resume|jd_evaluation|offer_evaluation|profile|reference_resume|file_export/i.test(context.taskType || "");
}
