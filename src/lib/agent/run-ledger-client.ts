import type { AgentRunStatus } from "@/lib/agent/run-ledger";

export interface ClientAgentRunRecord {
  id: string;
  user_id: string;
  session_id: number | null;
  task_type: string;
  agent_id: string;
  status: AgentRunStatus;
  contract_json?: unknown;
  result_json?: unknown;
  error_json?: unknown;
  created_at: string;
  updated_at: string;
}

export interface ClientAgentRunStepRecord {
  id: number;
  run_id: string;
  phase: string;
  tool_name: string;
  status: string;
  input_summary: string;
  output_summary: string;
  verifier_json?: unknown;
  error_json?: unknown;
  created_at: string;
}

export interface ClientAgentRunDetail {
  run: ClientAgentRunRecord;
  steps: ClientAgentRunStepRecord[];
}

interface JsonEnvelope<T> {
  success: boolean;
  enabled?: boolean;
  data?: T;
  error?: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<JsonEnvelope<T> | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as JsonEnvelope<T>;
    if (!res.ok || !json.success) return json || null;
    return json;
  } catch {
    return null;
  }
}

export async function listActiveAgentRunsClient(sessionId?: number | null): Promise<{
  enabled: boolean;
  data: ClientAgentRunRecord[];
}> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(String(sessionId))}` : "";
  const json = await requestJson<ClientAgentRunRecord[]>(`/api/agent/runs${qs}`);
  return {
    enabled: json?.enabled !== false,
    data: Array.isArray(json?.data) ? json.data : [],
  };
}

export async function createAgentRunClient(input: {
  sessionId?: number | null;
  taskType: string;
  agentId?: string;
  contract?: unknown;
}): Promise<ClientAgentRunRecord | null> {
  const json = await requestJson<ClientAgentRunRecord>("/api/agent/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return json?.data || null;
}

export async function updateAgentRunClient(
  runId: string | null | undefined,
  status: AgentRunStatus,
  patch: { result?: unknown; error?: unknown } = {},
): Promise<ClientAgentRunRecord | null> {
  if (!runId) return null;
  const json = await requestJson<ClientAgentRunRecord>(`/api/agent/runs/${encodeURIComponent(runId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...patch }),
  });
  return json?.data || null;
}

export async function getAgentRunClient(runId: string | null | undefined): Promise<ClientAgentRunDetail | null> {
  if (!runId) return null;
  const json = await requestJson<ClientAgentRunDetail>(`/api/agent/runs/${encodeURIComponent(runId)}`);
  if (!json?.data?.run) return null;
  return {
    run: json.data.run,
    steps: Array.isArray(json.data.steps) ? json.data.steps : [],
  };
}

export async function appendAgentRunStepClient(
  runId: string | null | undefined,
  input: {
    phase: string;
    toolName?: string;
    status?: string;
    inputSummary?: string;
    outputSummary?: string;
    verifier?: unknown;
    error?: unknown;
  },
): Promise<ClientAgentRunStepRecord | null> {
  if (!runId) return null;
  const json = await requestJson<ClientAgentRunStepRecord>(
    `/api/agent/runs/${encodeURIComponent(runId)}/steps`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return json?.data || null;
}

export async function cancelAgentRunClient(runId: string | null | undefined): Promise<boolean> {
  if (!runId) return false;
  const json = await requestJson<unknown>(`/api/agent/runs/${encodeURIComponent(runId)}`, {
    method: "DELETE",
  });
  return Boolean(json?.success);
}
