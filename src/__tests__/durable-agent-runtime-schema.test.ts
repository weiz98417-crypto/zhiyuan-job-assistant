import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("Durable Agent Runtime PostgreSQL schema", () => {
  it("persists snapshots, recovery state, governed attempts, and observer outbox", () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "postgres-schema.sql"),
      "utf8",
    );

    for (const fragment of [
      "snapshot_version BIGINT",
      "fencing_token BIGINT",
      "lease_expires_at TIMESTAMPTZ",
      "CREATE TABLE IF NOT EXISTS agent_run_events",
      "CREATE TABLE IF NOT EXISTS agent_run_checkpoints",
      "CREATE TABLE IF NOT EXISTS agent_run_inputs",
      "CREATE TABLE IF NOT EXISTS agent_run_gates",
      "CREATE TABLE IF NOT EXISTS agent_tool_attempts",
      "CREATE TABLE IF NOT EXISTS agent_background_jobs",
      "CREATE TABLE IF NOT EXISTS agent_run_outbox",
      "idx_agent_runs_claim",
      "idx_agent_run_outbox_delivery",
    ]) {
      expect(schema).toContain(fragment);
    }
  });
});
