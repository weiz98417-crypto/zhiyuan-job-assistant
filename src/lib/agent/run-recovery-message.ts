import type { AgentMessage } from "@/types";
import type { AgentRunSnapshot } from "@/lib/agent/runtime/durable-agent-run";

export function shortRunId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

export function buildRunRecoveryMessage(run: AgentRunSnapshot): string {
  const continuation = ["queued", "running", "recovering", "verifying", "cancel_requested"].includes(run.status)
    ? "Worker 会从最近的安全检查点继续；查看状态或关闭页面都不会重跑或取消它。"
    : run.status === "waiting_user"
      ? "这次运行正在等待你的补充信息或精确批准，提交后会继续同一个 Run。"
      : "这次运行已经进入终态，不会重复执行历史写入动作。";
  return [
    `已查看 Agent run #${shortRunId(run.id)} 的运行状态。`,
    `任务：${run.taskType || "unknown"}，状态：${run.status}。`,
    `快照版本：${run.snapshotVersion}，事件游标：${run.eventCursor}。`,
    continuation,
  ].join("\n");
}

export function upsertRunRecoveryStatusMessage(
  messages: AgentMessage[],
  runId: string,
  content: string,
  timestamp: string,
): AgentMessage[] {
  const recoveryKey = `agent-run-recovery:${runId}`;
  const nextMessage: AgentMessage = {
    role: "assistant",
    content,
    timestamp,
    toolName: "agent_run_status",
    toolResult: { type: "agent_run_recovery_status", runId, recoveryKey },
  };

  let replaced = false;
  const next = messages.map((message) => {
    const result = message.toolResult;
    const existingKey = result && typeof result === "object" && "recoveryKey" in result
      ? String((result as Record<string, unknown>).recoveryKey || "")
      : "";
    if (existingKey !== recoveryKey) return message;
    replaced = true;
    return nextMessage;
  });

  return replaced ? next : [...messages, nextMessage];
}

export function ensureTerminalRunFeedback(
  messages: AgentMessage[],
  run: { id: string; status: string; createdAt?: string; updatedAt?: string },
  timestamp: string,
): AgentMessage[] {
  if (run.status !== "failed" && run.status !== "succeeded") return messages;

  const itemId = `run-terminal:${run.id}`;
  const runStart = Date.parse(run.createdAt || "");
  const runEnd = Date.parse(run.updatedAt || timestamp);
  const latestUserIndex = messages.findLastIndex((message) =>
    message.role === "user"
    && (!Number.isFinite(runStart) || Date.parse(message.timestamp) >= runStart - 1_000)
    && (!Number.isFinite(runEnd) || Date.parse(message.timestamp) <= runEnd)
  );
  const laterUserIndex = messages.findIndex((message) =>
    message.role === "user" && Date.parse(message.timestamp) > runEnd
  );
  const hasReply = messages.some((message, index) =>
    message.role === "assistant"
    && !message.itemId?.startsWith("run-terminal:")
    && !message.itemId?.startsWith("status:")
    && message.toolName !== "agent_run_status"
    && Boolean(message.content.trim())
    && (latestUserIndex >= 0 ? index > latestUserIndex : Date.parse(message.timestamp) >= runStart)
    && (laterUserIndex < 0 || index < laterUserIndex)
  );
  const withoutFeedback = messages.filter((message) => message.itemId !== itemId);
  if (run.status === "succeeded" && hasReply) return withoutFeedback;

  const content = run.status === "failed"
    ? "本次任务未成功完成。请检查已有结果后再重试；涉及保存或提交的操作，请先核对状态，避免重复执行。"
    : "本次任务已结束，但没有收到可展示的回复。请重试；涉及保存或提交的操作，请先核对状态，避免重复执行。";
  const feedbackTimestamp = messages.find((message) => message.itemId === itemId)?.timestamp || timestamp;
  const nextMessage: AgentMessage = { role: "assistant", itemId, content, timestamp: feedbackTimestamp };
  const nextUserIndex = withoutFeedback.findIndex((message) =>
    message.role === "user" && Date.parse(message.timestamp) > runEnd
  );
  if (nextUserIndex < 0) return [...withoutFeedback, nextMessage];
  const result = [...withoutFeedback];
  result.splice(nextUserIndex, 0, nextMessage);
  return result;
}
