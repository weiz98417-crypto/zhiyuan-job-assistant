import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentRuntimeAdminService } from "@/lib/agent/runtime/runtime-admin";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/security/auth-guards");
  vi.doUnmock("@/lib/agent/runtime/runtime-admin");
});

describe("Agent Runtime Admin commands", () => {
  it("returns durable runtime queues and stale lease health without changing execution", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("agent_runtime_controls")) {
        return { rows: [{ claims_paused: false, pause_reason: "", updated_at: "2026-08-24T10:00:00.000Z" }] };
      }
      if (sql.includes("GROUP BY status") && sql.includes("agent_runs")) {
        return { rows: [{ status: "running", count: 1 }, { status: "waiting_user", count: 2 }] };
      }
      if (sql.includes("FROM agent_runs") && sql.includes("ORDER BY updated_at DESC")) {
        return { rows: [{
          id: "run-1", user_id: "user-1", session_id: 7, task_type: "resume_query",
          agent_id: "resume", status: "running", runtime_mode: "worker_all",
          snapshot_version: 4, event_sequence: 9, owner_id: "worker-a",
          lease_expires_at: "2026-08-24T09:59:00.000Z", heartbeat_at: "2026-08-24T09:58:30.000Z",
          fencing_token: 2, wake_at: "2026-08-24T09:55:00.000Z", isolation_reason: "",
          last_observation_json: { category: "provider" }, created_at: "2026-08-24T09:00:00.000Z",
          updated_at: "2026-08-24T09:58:30.000Z",
        }] };
      }
      if (sql.includes("FROM agent_run_events")) {
        return { rows: [{ id: 11, run_id: "run-1", user_id: "user-1", sequence: 9, event_type: "run.recovering", payload_json: { action: "retry" }, created_at: "2026-08-24T09:58:00.000Z" }] };
      }
      if (sql.includes("FROM agent_run_checkpoints")) {
        return { rows: [{ id: 5, run_id: "run-1", user_id: "user-1", snapshot_version: 4, fencing_token: 2, boundary: "recovery_observed", budgets_json: { modelAttempts: 1 }, created_at: "2026-08-24T09:58:00.000Z" }] };
      }
      if (sql.includes("status = 'dead_letter'") && sql.includes("ORDER BY")) {
        return { rows: [{ id: 21, run_id: "run-1", user_id: "user-1", event_sequence: 9, topic: "run_event", attempt_count: 5, last_error: "review timeout", dead_lettered_at: "2026-08-24T09:59:00.000Z", created_at: "2026-08-24T09:50:00.000Z" }] };
      }
      if (sql.includes("FROM agent_tool_attempts") && sql.includes("ORDER BY")) {
        return { rows: [{ id: "attempt-1", run_id: "run-1", user_id: "user-1", tool_name: "save_resume_section", status: "reconciling", effect_state: "unknown", input_json: { section: "summary" }, verifier_json: {}, error_json: { message: "connection lost" }, updated_at: "2026-08-24T09:59:00.000Z" }] };
      }
      if (sql.includes("FROM agent_background_jobs") && sql.includes("GROUP BY")) {
        return { rows: [{ status: "running", count: 1 }] };
      }
      if (sql.includes("FROM agent_background_jobs") && sql.includes("ORDER BY")) {
        return { rows: [{ id: "job-1", run_id: "run-1", tool_attempt_id: "attempt-1", user_id: "user-1", job_type: "ocr", status: "running", progress_json: { percent: 30 }, error_json: {}, owner_id: "background:worker-a", lease_expires_at: "2026-08-24T10:01:00.000Z", fencing_token: 1, updated_at: "2026-08-24T09:59:00.000Z" }] };
      }
      if (sql.includes("AS stale_lease_count")) {
        return { rows: [{ stale_lease_count: 1, active_lease_count: 2 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const service = new AgentRuntimeAdminService(async (callback) => callback({ query } as never));

    const status = await service.getStatus();

    expect(status.runsByStatus).toEqual({ running: 1, waiting_user: 2 });
    expect(status.recentRuns[0]).toMatchObject({ id: "run-1", ownerId: "worker-a", leaseStale: true });
    expect(status.recentEvents[0]).toMatchObject({ eventType: "run.recovering", payload: { action: "retry" } });
    expect(status.recentCheckpoints[0]).toMatchObject({ boundary: "recovery_observed", budgets: { modelAttempts: 1 } });
    expect(status.deadLetters[0]).toMatchObject({ id: 21, lastError: "review timeout" });
    expect(status.reconciliations[0]).toMatchObject({ id: "attempt-1", effectState: "unknown" });
    expect(status.backgroundJobs[0]).toMatchObject({ id: "job-1", progress: { percent: 30 } });
    expect(status).toMatchObject({ deadLetterCount: 1, reconciliationCount: 1, staleLeaseCount: 1, activeLeaseCount: 2 });
  });

  it("persists an audited pause-claims command", async () => {
    vi.doMock("@/lib/security/auth-guards", () => ({
      requireAdmin: async () => ({ userId: "admin-1", role: "admin" }),
    }));
    const execute = vi.fn(async () => ({ action: "pause_claims", claimsPaused: true }));
    vi.doMock("@/lib/agent/runtime/runtime-admin", () => ({
      getAgentRuntimeAdminService: () => ({ execute }),
    }));
    const route = await import("@/app/api/admin/agent-runtime/route");

    const response = await route.POST(new Request("http://localhost/api/admin/agent-runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "admin-command-1",
        action: "pause_claims",
        reason: "provider incident",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.claimsPaused).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      { userId: "admin-1" },
      { requestId: "admin-command-1", action: "pause_claims", reason: "provider incident" },
    );
  });
});
