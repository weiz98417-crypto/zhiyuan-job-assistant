import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewAgentRun, sanitizeReviewJson } from "@/lib/agent/run-review";
import type { AgentRunRecord, AgentRunStepRecord } from "@/lib/agent/run-ledger";
import {
  RunEvidenceObserver,
  type RunOutboxItem,
  type RunOutboxStore,
} from "@/lib/agent/runtime/run-evidence-observer";
import { AgentRuntimeAdminService } from "@/lib/agent/runtime/runtime-admin";

// Regression: ISSUE-ADMIN-RUNTIME-001 — observer/review failures must not rewrite a successful Run.
// Found by /qa on 2026-08-31
// Report: .gstack/qa-reports/production-2026-08-31/admin/qa-report-admin-production-2026-08-31.md

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/security/auth-guards");
  vi.doUnmock("@/lib/agent/runtime/runtime-admin");
});

function successfulRun(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: "run-success",
    user_id: "user-1",
    session_id: 122,
    task_type: "general_chat",
    agent_id: "general",
    status: "succeeded",
    contract_json: { taskType: "general_chat", successCriteria: ["answer generated"] },
    result_json: { text: "运行监控隔离验证通过" },
    error_json: {},
    created_at: "2026-08-31T06:56:37.000Z",
    updated_at: "2026-08-31T06:56:40.000Z",
    ...overrides,
  };
}

function reviewStep(overrides: Partial<AgentRunStepRecord> = {}): AgentRunStepRecord {
  return {
    id: 1,
    run_id: "run-success",
    phase: "verifying",
    tool_name: "save_resume_section",
    status: "succeeded",
    input_summary: "",
    output_summary: "saved",
    verifier_json: {},
    error_json: {},
    created_at: "2026-08-31T06:56:40.000Z",
    ...overrides,
  };
}

describe("admin runtime monitoring isolation regression", () => {
  it("dead-letters a failing observer projection without changing the successful Run", async () => {
    const run = successfulRun();
    let attemptCount = 0;
    const item: RunOutboxItem = {
      id: 1,
      runId: run.id,
      userId: run.user_id,
      eventSequence: 16,
      topic: "run_event",
      payload: { type: "run.status_changed", status: "succeeded" },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: "2026-08-31T06:56:40.000Z",
      lockedBy: null,
      lastError: "",
      createdAt: "2026-08-31T06:56:40.000Z",
    };
    const store: RunOutboxStore = {
      claimBatch: async () => [{ ...item, attemptCount, status: "processing" }],
      markDelivered: async () => undefined,
      markFailed: async (_itemId, error) => {
        attemptCount += 1;
        item.attemptCount = attemptCount;
        item.lastError = error;
        item.status = attemptCount >= 5 ? "dead_letter" : "pending";
        return item.status;
      },
    };
    const observer = new RunEvidenceObserver(store, {
      run_event: async () => {
        throw new Error("review provider stalled");
      },
    });

    const results = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      results.push(await observer.processBatch("observer-admin-regression", 1));
    }

    expect(results.slice(0, 4)).toEqual(Array.from({ length: 4 }, () => ({
      claimed: 1,
      delivered: 0,
      failed: 1,
      deadLettered: 0,
    })));
    expect(results[4]).toEqual({ claimed: 1, delivered: 0, failed: 1, deadLettered: 1 });
    expect(item).toMatchObject({ status: "dead_letter", attemptCount: 5 });
    expect(run.status).toBe("succeeded");
    expect(run.result_json).toEqual({ text: "运行监控隔离验证通过" });
  });

  it("reads dead-letter, reconciliation, and lease health without issuing writes", async () => {
    const run = successfulRun();
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes("agent_runtime_controls")) {
        return { rows: [{ claims_paused: false, pause_reason: "", updated_at: null }] };
      }
      if (sql.includes("GROUP BY status") && sql.includes("agent_runs")) {
        return { rows: [{ status: "succeeded", count: 43 }] };
      }
      if (sql.includes("FROM agent_runs") && sql.includes("ORDER BY updated_at DESC")) {
        return { rows: [{
          id: run.id,
          user_id: run.user_id,
          session_id: run.session_id,
          task_type: run.task_type,
          agent_id: run.agent_id,
          status: run.status,
          runtime_mode: "worker_all",
          snapshot_version: 16,
          event_sequence: 16,
          owner_id: null,
          lease_expires_at: null,
          heartbeat_at: run.updated_at,
          fencing_token: 1,
          wake_at: null,
          isolation_reason: "",
          last_observation_json: {},
          error_json: {},
          created_at: run.created_at,
          updated_at: run.updated_at,
        }] };
      }
      if (sql.includes("FROM agent_run_events")) {
        return { rows: [{
          id: 16,
          run_id: run.id,
          user_id: run.user_id,
          sequence: 16,
          event_type: "run.status_changed",
          payload_json: { status: "succeeded" },
          created_at: run.updated_at,
        }] };
      }
      if (sql.includes("FROM agent_run_checkpoints")) return { rows: [] };
      if (sql.includes("status = 'dead_letter'") && sql.includes("ORDER BY")) {
        return { rows: [{
          id: 7,
          run_id: run.id,
          user_id: run.user_id,
          event_sequence: 16,
          topic: "run_event",
          attempt_count: 5,
          last_error: "review provider stalled",
          dead_lettered_at: run.updated_at,
          created_at: run.updated_at,
        }] };
      }
      if (sql.includes("FROM agent_tool_attempts")) {
        return { rows: [{
          id: "attempt-1",
          run_id: "run-waiting",
          user_id: "user-2",
          tool_name: "create_resume_edit_proposal",
          status: "reconciling",
          effect_state: "unknown",
          input_json: {},
          verifier_json: {},
          error_json: {},
          updated_at: run.updated_at,
        }] };
      }
      if (sql.includes("FROM agent_background_jobs") && sql.includes("GROUP BY")) return { rows: [] };
      if (sql.includes("FROM agent_background_jobs") && sql.includes("ORDER BY")) return { rows: [] };
      if (sql.includes("AS stale_lease_count")) {
        return { rows: [{ stale_lease_count: 0, active_lease_count: 0 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const service = new AgentRuntimeAdminService(async (callback) => callback({ query } as never));

    const status = await service.getStatus();

    expect(status).toMatchObject({
      runsByStatus: { succeeded: 43 },
      deadLetterCount: 1,
      reconciliationCount: 1,
      staleLeaseCount: 0,
      activeLeaseCount: 0,
    });
    expect(status.recentRuns[0]).toMatchObject({ id: run.id, status: "succeeded" });
    expect(statements.some((sql) => /^\s*(UPDATE|INSERT|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql))).toBe(false);
    expect(run.status).toBe("succeeded");
  });

  it("keeps the Run terminal state when deterministic Review returns fail", () => {
    const run = successfulRun({
      task_type: "resume_edit",
      agent_id: "resume",
      contract_json: { taskType: "resume_edit", target: "cv.summary" },
    });

    const review = reviewAgentRun(run, [reviewStep({
      verifier_json: { readBackRequirement: { required: true, satisfied: false } },
    })]);

    expect(review).toMatchObject({ verdict: "fail", primaryFailureType: "missing_readback" });
    expect(review.run.status).toBe("succeeded");
    expect(run.status).toBe("succeeded");
  });

  it("redacts secrets and personal data from monitoring projections", () => {
    const serialized = JSON.stringify(sanitizeReviewJson({
      authorization: "Bearer production-secret-token-1234567890",
      apiKey: "sk-production-secret-123456",
      contact: "user@example.com 13800138000",
      image: "data:image/png;base64,AAAA",
      fencingToken: "sensitive-fence",
    }));

    expect(serialized).not.toContain("production-secret");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("data:image");
    expect(serialized).toContain("[redacted]");
  });

  it("returns 403 to non-admin runtime-monitoring readers", async () => {
    vi.doMock("@/lib/security/auth-guards", () => ({
      requireAdmin: async () => {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      },
    }));
    const getStatus = vi.fn();
    vi.doMock("@/lib/agent/runtime/runtime-admin", () => ({
      getAgentRuntimeAdminService: () => ({ getStatus }),
    }));
    const route = await import("@/app/api/admin/agent-runtime/route");

    const response = await route.GET();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ success: false, error: "Forbidden" });
    expect(getStatus).not.toHaveBeenCalled();
  });
});
