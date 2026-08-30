import type {
  AgentRunEvent,
  AgentRunGate,
  AgentRunSnapshot,
  DurableRunInput,
  SubmitAgentRunInputResult,
} from "@/lib/agent/runtime/durable-agent-run";
import type { AgentRuntimeAssignment } from "@/lib/agent/runtime/runtime-mode";

export interface DurableRunCreateCommand {
  requestId: string;
  conversationId: number | null;
  taskType: string;
  agentId: string;
  input: DurableRunInput;
  contract?: unknown;
  parentRunId?: string | null;
}

export interface DurableRunCreateResponse {
  run: AgentRunSnapshot | null;
  replayed: boolean;
  assignment: AgentRuntimeAssignment;
}

export interface DurableRunEventBatch {
  events: AgentRunEvent[];
  cursor: number;
}

export class DurableRunOwnershipUnknownError extends Error {
  constructor() {
    super("无法确认 Agent Run 的执行归属，请稍后重试；为避免重复执行，本次不会降级到本地运行。");
    this.name = "DurableRunOwnershipUnknownError";
  }
}

export interface DurableRunObserverOptions {
  afterCursor?: number;
  pollIntervalMs?: number;
  onEvents(events: AgentRunEvent[], cursor: number): void;
  onError?(error: unknown): void;
}

const RUN_EVENT_TYPES = [
  "message",
  "run.created",
  "run.claimed",
  "run.status_changed",
  "run.ui_event",
  "run.input_accepted",
  "run.cancel_requested",
  "run.gate_opened",
  "run.gate_resolved",
];
const RUN_CREATE_REQUEST_TIMEOUT_MS = 5_000;

interface JsonEnvelope<T> {
  success: boolean;
  enabled?: boolean;
  data?: T;
  error?: string;
}

export async function createDurableAgentRunClient(
  command: DurableRunCreateCommand,
): Promise<DurableRunCreateResponse | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await requestJson<DurableRunCreateResponse>("/api/agent/runs", {
      method: "POST",
      body: JSON.stringify(command),
    }, RUN_CREATE_REQUEST_TIMEOUT_MS);
    if (result?.data) return result.data;
  }
  throw new DurableRunOwnershipUnknownError();
}

export async function submitDurableAgentRunInputClient(
  runId: string,
  command: { requestId: string; input: DurableRunInput },
): Promise<SubmitAgentRunInputResult | null> {
  const result = await requestJson<SubmitAgentRunInputResult>(
    `/api/agent/runs/${encodeURIComponent(runId)}/inputs`,
    { method: "POST", body: JSON.stringify(command) },
  );
  return result?.data || null;
}

export async function requestDurableAgentRunCancelClient(
  runId: string,
  requestId: string,
): Promise<AgentRunSnapshot | null> {
  const result = await requestJson<{ run: AgentRunSnapshot }>(
    `/api/agent/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", body: JSON.stringify({ requestId }) },
  );
  return result?.data?.run || null;
}

export async function requestDurableAgentRunPauseClient(
  runId: string,
  requestId: string,
): Promise<AgentRunSnapshot | null> {
  const result = await requestJson<{ run: AgentRunSnapshot }>(
    `/api/agent/runs/${encodeURIComponent(runId)}/pause`,
    { method: "POST", body: JSON.stringify({ requestId }) },
  );
  return result?.data?.run || null;
}

export async function requestDurableAgentRunResumeClient(
  runId: string,
  requestId: string,
): Promise<AgentRunSnapshot | null> {
  const result = await requestJson<{ run: AgentRunSnapshot }>(
    `/api/agent/runs/${encodeURIComponent(runId)}/resume`,
    { method: "POST", body: JSON.stringify({ requestId }) },
  );
  return result?.data?.run || null;
}

export async function respondDurableAgentRunGateClient(
  gateId: string,
  decision: "approved" | "denied",
  requestId: string,
): Promise<AgentRunGate | null> {
  const result = await requestJson<{ gate: AgentRunGate }>(
    `/api/agent/run-gates/${encodeURIComponent(gateId)}/response`,
    { method: "POST", body: JSON.stringify({ requestId, decision }) },
  );
  return result?.data?.gate || null;
}

export async function listActiveDurableAgentRunsClient(
  conversationId?: number | null,
): Promise<AgentRunSnapshot[]> {
  const query = conversationId === null || conversationId === undefined
    ? "?activeOnly=true"
    : `?conversationId=${encodeURIComponent(String(conversationId))}&activeOnly=true`;
  const result = await requestJson<AgentRunSnapshot[]>(`/api/agent/runs${query}`);
  return Array.isArray(result?.data) ? result.data : [];
}

export async function getDurableAgentRunClient(
  runId: string,
): Promise<AgentRunSnapshot | null> {
  const result = await requestJson<{ run: AgentRunSnapshot }>(
    `/api/agent/runs/${encodeURIComponent(runId)}`,
  );
  return result?.data?.run || null;
}

export async function pollDurableAgentRunEventsClient(
  runId: string,
  afterCursor: number,
): Promise<DurableRunEventBatch | null> {
  const result = await requestJson<DurableRunEventBatch>(
    `/api/agent/runs/${encodeURIComponent(runId)}/events?after=${Math.max(0, Math.floor(afterCursor))}`,
  );
  return result?.data || null;
}

export function observeDurableAgentRun(
  runId: string,
  options: DurableRunObserverOptions,
): () => void {
  let cursor = Math.max(0, Math.floor(options.afterCursor || 0));
  let stopped = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let source: EventSource | null = null;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs || 1_500);

  const deliver = (events: AgentRunEvent[]) => {
    const next = events
      .filter((event) => event.sequence > cursor)
      .sort((left, right) => left.sequence - right.sequence);
    if (next.length === 0) return;
    cursor = next.at(-1)!.sequence;
    options.onEvents(next, cursor);
  };

  const poll = async () => {
    if (stopped) return;
    polling = true;
    try {
      const batch = await pollDurableAgentRunEventsClient(runId, cursor);
      if (!batch) throw new Error("Durable Agent Run event polling failed");
      deliver(batch.events);
      cursor = Math.max(cursor, batch.cursor);
    } catch (error) {
      options.onError?.(error);
    } finally {
      polling = false;
      if (!stopped) timer = setTimeout(() => void poll(), pollIntervalMs);
    }
  };

  const startPolling = () => {
    if (stopped || polling || timer) return;
    void poll();
  };

  if (typeof EventSource === "undefined") {
    startPolling();
  } else {
    source = new EventSource(
      `/api/agent/runs/${encodeURIComponent(runId)}/events?after=${cursor}`,
    );
    const receive = (message: MessageEvent<string>) => {
      try {
        deliver([JSON.parse(message.data) as AgentRunEvent]);
      } catch (error) {
        options.onError?.(error);
      }
    };
    for (const type of RUN_EVENT_TYPES) {
      source.addEventListener(type, receive as EventListener);
    }
    source.onerror = () => {
      source?.close();
      source = null;
      startPolling();
    };
  }

  return () => {
    stopped = true;
    source?.close();
    source = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<JsonEnvelope<T> | null> {
  const timeoutController = timeoutMs ? new AbortController() : null;
  const timeout = timeoutController
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      ...init,
      signal: timeoutController?.signal || init?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({})) as JsonEnvelope<T>;
    return response.ok && payload.success ? payload : null;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
