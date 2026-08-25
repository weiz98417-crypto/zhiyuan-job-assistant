import type { AgentBackgroundJobHandler } from "@/lib/agent/runtime/agent-background-job-worker";
import type { ToolRegistry } from "@/lib/agent/tools/registry";

export function createBackgroundToolHandlers(registry: ToolRegistry): Record<string, AgentBackgroundJobHandler> {
  return Object.fromEntries(
    registry.getAll()
      .filter((tool) => tool.capability?.workerExecution === "background")
      .map((tool) => [tool.name, async (job, signal) => {
        const args = record(job.handle.args);
        const allowlist = Array.isArray(job.handle.allowlist)
          ? job.handle.allowlist.map(String)
          : [tool.name];
        const toolResult = await registry.execute(tool.name, args, {
          principal: { userId: job.userId },
          runId: job.runId,
          allowlist,
          signal,
          requestId: typeof job.handle.requestId === "string" ? job.handle.requestId : job.id,
        });
        return { toolResult };
      }]),
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
