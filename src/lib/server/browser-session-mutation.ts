const INTERNAL_AGENT_FIELDS = [
  "durableInterview", "checkpointVersion", "checkpointStateHash", "lastTurnFingerprint", "lastTurnResult", "requestKey",
];

export function browserSessionMutationError(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "会话更新必须是对象。";
  const mutation = input as Record<string, unknown>;
  if ("expectedInterviewCheckpointVersion" in mutation) return "面试状态版本只由服务端维护。";
  if (mutation.agentState !== undefined) {
    const agentState = parseObject(mutation.agentState);
    if (!agentState || INTERNAL_AGENT_FIELDS.some((field) => field in agentState)) return "面试执行凭据只由服务端维护。";
  }
  if (mutation.interviewState !== undefined) {
    const interview = parseObject(mutation.interviewState);
    if (!interview || ["checkpointVersion", "phase", "questions", "answers", "currentQuestion", "currentFollowups", "legacyRecovery"].some((field) => field in interview)) {
      return "面试状态只由面试引擎维护；客户端只能创建未开始的准备记录。";
    }
    if (!parseObject(interview.planSnapshot)?.snapshotId || ["questionGraph", "transcript", "scoreArtifacts", "rebindHistory"].some((field) => {
      const value = interview[field];
      return value !== undefined && (!Array.isArray(value) || value.length !== 0);
    }) || interview.currentQuestionId || interview.recap || (interview.status !== undefined && interview.status !== "active")) {
      return "客户端只能创建未开始的面试准备记录。";
    }
  }
  return undefined;
}

export function hasDurableInterviewCheckpoint(input: unknown): boolean {
  return Number(parseObject(input)?.checkpointVersion || 0) > 0;
}

function parseObject(input: unknown): Record<string, unknown> | undefined {
  try {
    const value = typeof input === "string" ? JSON.parse(input) : input;
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
