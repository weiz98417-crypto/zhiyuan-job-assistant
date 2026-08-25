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
