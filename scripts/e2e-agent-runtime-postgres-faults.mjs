import path from "node:path";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import pg from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const { Client, Pool } = pg;

const expectedDatabase = process.env.AGENT_RUNTIME_E2E_EXPECT_DATABASE?.trim();
if (process.env.AGENT_RUNTIME_E2E_ALLOW_FAULTS !== "1" || !expectedDatabase) {
  throw new Error("Refusing fault injection without AGENT_RUNTIME_E2E_ALLOW_FAULTS=1 and AGENT_RUNTIME_E2E_EXPECT_DATABASE");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: "zhiyuan-agent-runtime-e2e-controller",
  max: 6,
});

const report = {
  database: "",
  userId: "",
  doubleClaim: {},
  leaseTakeover: {},
  staleOwner: {},
  backendTermination: {},
};

try {
  const databaseResult = await pool.query("SELECT current_database() AS name");
  report.database = String(databaseResult.rows[0]?.name || "");
  if (report.database !== expectedDatabase) {
    throw new Error(`Refusing fault injection against unexpected database: ${report.database || "unknown"}`);
  }

  const userResult = await pool.query(`
    SELECT users.id
    FROM users
    WHERE NOT EXISTS (
      SELECT 1
      FROM agent_runs
      WHERE agent_runs.user_id = users.id
        AND agent_runs.legacy = FALSE
        AND agent_runs.status IN ('queued', 'running', 'waiting_user', 'recovering', 'verifying', 'cancel_requested')
    )
    ORDER BY users.created_at DESC
    LIMIT 1
  `);
  report.userId = String(userResult.rows[0]?.id || "");
  if (!report.userId) throw new Error("No isolated test user without an active Agent Run was found");

  const firstNow = new Date(Date.now() + 10 * 60_000);
  const doubleClaimRunId = await insertQueuedRun(report.userId, firstNow, "double-claim");
  const doubleClaims = await Promise.all([
    claimNextRun("e2e-double-a", firstNow, 30_000),
    claimNextRun("e2e-double-b", firstNow, 30_000),
  ]);
  const winners = doubleClaims.filter((run) => run?.id === doubleClaimRunId);
  assert(winners.length === 1, `Expected one double-claim winner, received ${winners.length}`);
  report.doubleClaim = {
    runId: doubleClaimRunId,
    winnerCount: winners.length,
    ownerId: winners[0].owner_id,
    fencingToken: Number(winners[0].fencing_token),
  };
  await markFailed(doubleClaimRunId, winners[0].owner_id, Number(winners[0].fencing_token), "double claim verified");

  const leaseStart = new Date(firstNow.getTime() + 60_000);
  const leaseRunId = await insertQueuedRun(report.userId, leaseStart, "lease-takeover");
  const firstLease = await claimNextRun("e2e-lease-a", leaseStart, 500);
  assert(firstLease?.id === leaseRunId, "First lease was not acquired by the expected Worker");
  const earlyTakeover = await claimNextRun("e2e-lease-b", new Date(leaseStart.getTime() + 100), 500);
  assert(earlyTakeover === null, "A second Worker claimed the run before lease expiry");
  const takeover = await claimNextRun("e2e-lease-b", new Date(leaseStart.getTime() + 1_000), 30_000);
  assert(takeover?.id === leaseRunId, "The expired lease was not reclaimed");
  assert(Number(takeover.fencing_token) === Number(firstLease.fencing_token) + 1, "Fencing token did not increment on takeover");
  report.leaseTakeover = {
    runId: leaseRunId,
    earlyTakeoverBlocked: true,
    firstFencingToken: Number(firstLease.fencing_token),
    takeoverFencingToken: Number(takeover.fencing_token),
    takeoverOwnerId: takeover.owner_id,
  };

  const staleWrite = await pool.query(`
    UPDATE agent_runs
    SET status = 'succeeded', updated_at = now()
    WHERE id = $1 AND owner_id = $2 AND fencing_token = $3
    RETURNING id
  `, [leaseRunId, firstLease.owner_id, firstLease.fencing_token]);
  assert(staleWrite.rowCount === 0, "The stale Worker was able to mutate the reclaimed run");
  const currentWrite = await markFailed(leaseRunId, takeover.owner_id, Number(takeover.fencing_token), "lease takeover verified");
  assert(currentWrite === 1, "The current Worker could not finalize its claimed run");
  report.staleOwner = {
    runId: leaseRunId,
    staleWriteRows: staleWrite.rowCount,
    currentWriteRows: currentWrite,
  };

  const victim = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: `zhiyuan-agent-runtime-e2e-victim-${randomUUID()}`,
  });
  victim.on("error", () => {});
  await victim.connect();
  const victimPidResult = await victim.query("SELECT pg_backend_pid() AS pid, current_database() AS database");
  const victimPid = Number(victimPidResult.rows[0]?.pid || 0);
  assert(victimPid > 0, "Dedicated fault-injection backend PID was not available");
  assert(String(victimPidResult.rows[0]?.database || "") === expectedDatabase, "Dedicated backend connected to the wrong database");
  const terminated = await pool.query("SELECT pg_terminate_backend($1) AS terminated", [victimPid]);
  assert(terminated.rows[0]?.terminated === true, "Dedicated test backend was not terminated");
  await delay(100);
  let victimRejected = false;
  try {
    await victim.query("SELECT 1");
  } catch {
    victimRejected = true;
  }
  await victim.end().catch(() => {});
  assert(victimRejected, "Terminated test backend unexpectedly accepted another query");
  const controllerHealth = await pool.query("SELECT 1 AS healthy");
  assert(Number(controllerHealth.rows[0]?.healthy) === 1, "Controller connection did not survive dedicated backend termination");
  report.backendTermination = {
    terminatedPid: victimPid,
    victimRejected,
    controllerHealthy: true,
  };

  process.stdout.write(`${JSON.stringify({ success: true, report }, null, 2)}\n`);
} finally {
  await pool.end();
}

async function insertQueuedRun(userId, wakeAt, scenario) {
  const id = randomUUID();
  await pool.query(`
    INSERT INTO agent_runs (
      id, user_id, request_id, task_type, agent_id, status, contract_json,
      runtime_mode, execution_owner, snapshot_version, event_sequence,
      policy_versions_json, budgets_json, wake_at, legacy, error_json
    ) VALUES (
      $1, $2, $3, 'runtime_e2e_fault_test', 'e2e', 'queued', '{}'::jsonb,
      'worker_all', 'worker', 1, 1,
      '{}'::jsonb, '{}'::jsonb, $4, FALSE, $5::jsonb
    )
  `, [id, userId, `e2e-${scenario}-${randomUUID()}`, wakeAt, JSON.stringify({ scenario })]);
  return id;
}

async function claimNextRun(workerId, now, leaseMs) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const candidate = await client.query(`
      SELECT candidate.id
      FROM agent_runs candidate
      WHERE candidate.legacy = FALSE
        AND candidate.isolation_requested_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM agent_runtime_controls control
          WHERE control.id = 'global' AND control.claims_paused = TRUE
        )
        AND candidate.wake_at <= $1::timestamptz
        AND (
          candidate.status = 'queued'
          OR (candidate.status = 'cancel_requested' AND candidate.owner_id IS NULL)
          OR (
            candidate.status IN ('running', 'recovering', 'verifying', 'cancel_requested')
            AND candidate.lease_expires_at <= $1
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM agent_runs active
          WHERE active.user_id = candidate.user_id
            AND active.id <> candidate.id
            AND active.legacy = FALSE
            AND active.status IN ('running', 'recovering', 'verifying', 'cancel_requested')
            AND active.lease_expires_at > $1::timestamptz
        )
      ORDER BY candidate.wake_at ASC, candidate.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `, [now]);
    if (!candidate.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    const updated = await client.query(`
      UPDATE agent_runs
      SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
          owner_id = $2,
          fencing_token = fencing_token + 1,
          heartbeat_at = $3::timestamptz,
          lease_expires_at = $3::timestamptz + ($4::bigint * interval '1 millisecond'),
          snapshot_version = snapshot_version + 1,
          event_sequence = event_sequence + 1,
          updated_at = $3::timestamptz
      WHERE id = $1
      RETURNING *
    `, [candidate.rows[0].id, workerId, now, leaseMs]);
    await client.query("COMMIT");
    return updated.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markFailed(runId, ownerId, fencingToken, reason) {
  const result = await pool.query(`
    UPDATE agent_runs
    SET status = 'failed',
        owner_id = NULL,
        lease_expires_at = NULL,
        completed_at = now(),
        updated_at = now(),
        error_json = error_json || $4::jsonb
    WHERE id = $1 AND owner_id = $2 AND fencing_token = $3
    RETURNING id
  `, [runId, ownerId, fencingToken, JSON.stringify({ e2eResult: reason })]);
  return result.rowCount;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
