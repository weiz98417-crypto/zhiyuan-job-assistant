# 0039 - Unattended runs and browser capability enter through existing seams

Date: 2026-10-01

## Status

Accepted

## Context

The 2026-10 review adopted two product capabilities that would otherwise grow new execution paths: scheduled proactive job-digest runs (持续岗位发现, delivered as 岗位精选) and agent-driven browser automation. The runtime already owns the authoritative pieces — Run Admission, the durable worker, governed tool attempts with scoped Run Gates — while the legacy scan pipeline (scan_queue plus scan-worker.mjs) is a separate process that does not inherit run governance.

## Decision

1. A scheduled digest (岗位精选) is a full durable Agent Run created through Run Admission, bound to a read-only contract: write tools are absent from its allowlist, the output is a summary delivered as a Conversation Item, and delivery and failure notification are separate concerns. It is not a scan_queue extension. The scheduler only wakes runs; it never executes work. Missed schedules are reconciled: catch up once within 24 hours, otherwise skip with a visible note in the next digest.
2. Browser capability enters through the MCPManager seam — its auto-registration path is currently dormant (zero callers) and is revived for this purpose, with config schema extended for launch args and a startup health assertion so a cold-start timeout can never silently skip registration. `@playwright/mcp` runs headless and isolated, and browser tool sessions are serialized per worker so concurrent Runs never share page state. Tools are registered under explicit governance metadata — name-inferred legacy governance is not acceptable for browser writes. Navigation, reading, and extraction are read-effect tools; click, type, and submit are write-effect and require a scoped Run Gate. Any browser tool without an explicit classification is treated as write-effect, and `browser_evaluate` (arbitrary in-page JS) is not registered.
3. Navigation is bounded by a repository-owned domain allowlist (TS config, changed via PR review, seeded with mainstream job portals). Outside the allowlist, navigation is denied silently — no approval prompt. Approval prompts are reserved for write actions.

## Consequences

The scheduler lives in the agent-worker loop alongside background-job polling; a `scheduled_run` table is additive schema. The scan pipeline's behavior is unchanged by this work — its old Postgres blockage was already fixed in commit 50919be — and digest work must not alter scan-worker behavior. If a future digest needs fresh scans, the scheduler may enqueue a scan job for the existing pipeline — the unattended run itself stays read-only. Direct Playwright integration and per-navigation approval prompts were rejected.
