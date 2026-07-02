import type { AgentMessage } from "@/types";
import type { ClientAgentRunDetail, ClientAgentRunStepRecord } from "@/lib/agent/run-ledger-client";

function latestRunStep(steps: ClientAgentRunStepRecord[] | undefined): ClientAgentRunStepRecord | null {
  return Array.isArray(steps) && steps.length > 0 ? steps[steps.length - 1] : null;
}

export function shortRunId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

export function buildRunRecoveryMessage(detail: ClientAgentRunDetail): string {
  const lastStep = latestRunStep(detail.steps);
  const run = detail.run;
  const stepText = lastStep
    ? `最近一步：${lastStep.phase}${lastStep.tool_name ? ` / ${lastStep.tool_name}` : ""}（${lastStep.status || "unknown"}）`
    : "还没有记录到具体执行步骤";
  return [
    `已查看 Agent run #${shortRunId(run.id)} 的运行状态。`,
    `任务：${run.task_type || "unknown"}，状态：${run.status}。`,
    stepText,
    run.status === "running"
      ? "这次运行停在未完成状态。为避免重复高风险写入，我不会自动重跑；你可以继续输入下一步需求，或取消这次运行。"
      : "这次运行已经有明确状态，不会重复执行历史写入动作。",
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
