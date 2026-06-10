export type AgentFailureCategory =
  | "transient"
  | "validation_failed"
  | "read_back_mismatch"
  | "base_version_conflict"
  | "unclear_intent"
  | "destructive_risk"
  | "policy_denied";

export type RepairAction =
  | "retry"
  | "safe_fail"
  | "rollback"
  | "ask_clarification"
  | "require_approval"
  | "deny";

export interface RepairPolicyInput {
  category: AgentFailureCategory;
  retryCount?: number;
  maxRetries?: number;
  protectedTarget?: string;
  detail?: string;
}

export interface RepairPolicyDecision {
  category: AgentFailureCategory;
  action: RepairAction;
  shouldRetry: boolean;
  shouldRollback: boolean;
  requiresUserInput: boolean;
  message: string;
}

export function decideRepairPolicy(input: RepairPolicyInput): RepairPolicyDecision {
  const retryCount = input.retryCount || 0;
  const maxRetries = input.maxRetries ?? 2;
  const target = input.protectedTarget || "用户数据";
  const detail = input.detail ? `：${input.detail}` : "";

  if (input.category === "transient") {
    if (retryCount < maxRetries) {
      return {
        category: input.category,
        action: "retry",
        shouldRetry: true,
        shouldRollback: false,
        requiresUserInput: false,
        message: `临时错误${detail}，系统将自动重试（${retryCount + 1}/${maxRetries}）。`,
      };
    }
    return {
      category: input.category,
      action: "safe_fail",
      shouldRetry: false,
      shouldRollback: false,
      requiresUserInput: false,
      message: `临时错误重试已达到上限，已停止操作，未继续修改${target}。`,
    };
  }

  if (input.category === "validation_failed") {
    return {
      category: input.category,
      action: "safe_fail",
      shouldRetry: false,
      shouldRollback: false,
      requiresUserInput: false,
      message: `内容校验失败${detail}，已阻止写入${target}。`,
    };
  }

  if (input.category === "read_back_mismatch") {
    return {
      category: input.category,
      action: "rollback",
      shouldRetry: false,
      shouldRollback: true,
      requiresUserInput: false,
      message: `写入后读取结果不一致${detail}，系统必须回滚或标记失败，不能宣称已成功。`,
    };
  }

  if (input.category === "base_version_conflict") {
    return {
      category: input.category,
      action: "ask_clarification",
      shouldRetry: false,
      shouldRollback: false,
      requiresUserInput: true,
      message: `${target}已发生变化，需要重新生成差异并请用户确认。`,
    };
  }

  if (input.category === "unclear_intent") {
    return {
      category: input.category,
      action: "ask_clarification",
      shouldRetry: false,
      shouldRollback: false,
      requiresUserInput: true,
      message: `用户意图不明确${detail}，只问一个澄清问题后再继续。`,
    };
  }

  if (input.category === "destructive_risk") {
    return {
      category: input.category,
      action: "require_approval",
      shouldRetry: false,
      shouldRollback: false,
      requiresUserInput: true,
      message: `操作可能破坏${target}，必须获得用户明确批准。`,
    };
  }

  return {
    category: input.category,
    action: "deny",
    shouldRetry: false,
    shouldRollback: false,
    requiresUserInput: false,
    message: `策略禁止执行该操作${detail}，已停止且未修改${target}。`,
  };
}
