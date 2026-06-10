import type { SSEEvent } from "@/lib/agent/loop/types";
import { orchestrateGen, type OrchestratorContext } from "@/lib/agent/orchestrator";

export interface AgentRunInput {
  runId?: string;
  content: string;
  context: OrchestratorContext;
}

export type AgentRunEvent = SSEEvent & {
  runId?: string;
};

export interface AgentRuntimeAdapter {
  run(input: AgentRunInput): AsyncIterable<AgentRunEvent>;
  cancel(runId: string): Promise<void>;
  resume(runId: string): AsyncIterable<AgentRunEvent>;
}

export class CurrentOrchestratorRuntimeAdapter implements AgentRuntimeAdapter {
  private readonly controllers = new Map<string, AbortController>();

  async *run(input: AgentRunInput): AsyncIterable<AgentRunEvent> {
    const controller = new AbortController();
    const runId = input.runId;
    if (runId) this.controllers.set(runId, controller);

    const signal = input.context.signal || controller.signal;
    try {
      for await (const event of orchestrateGen(input.content, { ...input.context, signal })) {
        yield runId ? { ...event, runId } : event;
      }
    } finally {
      if (runId) this.controllers.delete(runId);
    }
  }

  async cancel(runId: string): Promise<void> {
    const controller = this.controllers.get(runId);
    if (controller) controller.abort();
    this.controllers.delete(runId);
  }

  async *resume(runId: string): AsyncIterable<AgentRunEvent> {
    yield {
      type: "error",
      message: "Current orchestrator runtime cannot resume durable runs yet; agent run ledger integration is required first.",
      runId,
    };
    yield { type: "done", runId };
  }
}

export const currentOrchestratorRuntimeAdapter = new CurrentOrchestratorRuntimeAdapter();
