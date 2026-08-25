import registry from "@/lib/agent/tools";
import type { ToolResult } from "@/lib/agent/tools/types";
import {
  GovernedToolAttemptExecutor,
  type GovernedToolAttemptOutcome,
} from "@/lib/agent/runtime/governed-tool-attempt";
import { PostgresToolAttemptStore } from "@/lib/agent/runtime/postgres-tool-attempt-store";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { AgentBackgroundJobService } from "@/lib/agent/runtime/agent-background-job";
import { PostgresAgentBackgroundJobStore } from "@/lib/agent/runtime/postgres-background-job-store";
import { getDurableAgentRuntime } from "@/lib/agent/runtime/runtime-factory";

let executor: GovernedToolAttemptExecutor | null = null;

function getExecutor(): GovernedToolAttemptExecutor {
  if (!executor) {
    executor = new GovernedToolAttemptExecutor(
      registry,
      new PostgresToolAttemptStore(),
      new AgentBackgroundJobService(new PostgresAgentBackgroundJobStore()),
      getDurableAgentRuntime(),
    );
  }
  return executor;
}

export interface GovernedRuntimeToolInput {
  principal: ExecutionPrincipal;
  runId: string;
  workerId: string;
  fencingToken: number;
  toolName: string;
  args: Record<string, unknown>;
  allowlist: readonly string[];
  requestId?: string;
  policyDenial?: ToolResult;
  signal?: AbortSignal;
}

export function executeGovernedRuntimeTool(input: GovernedRuntimeToolInput): Promise<GovernedToolAttemptOutcome> {
  return getExecutor().execute({
    principal: input.principal,
    runId: input.runId,
    workerId: input.workerId,
    fencingToken: input.fencingToken,
    toolName: input.toolName,
    args: input.args,
    allowlist: input.allowlist,
    idempotencyKey: input.requestId,
    policyDenial: input.policyDenial,
    signal: input.signal,
  });
}

export function reconcileGovernedRuntimeTools(input: {
  principal: ExecutionPrincipal;
  runId: string;
  workerId: string;
  fencingToken: number;
  signal?: AbortSignal;
}): Promise<{ resolved: number; unresolved: number }> {
  return getExecutor().reconcileOutstanding(input);
}
