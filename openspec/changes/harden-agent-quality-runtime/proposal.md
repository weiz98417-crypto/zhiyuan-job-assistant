# Change: harden-agent-quality-runtime

## Why

The agent system can now chat, route, call tools, and use long-term memory, but high-risk work still fails at the exact moment it writes state. Recent failures show the same structural problem: the model can produce a good conversation, then save incomplete markdown, placeholder instructions, stale context, or half-finished content into durable user data. Window switches and long runs also lose execution memory because the run state mostly lives in the client loop.

Prompt instructions and one-off guards are no longer enough. The system needs an enforceable quality runtime: durable run ledgers, verified write tools, draft/approval/apply flows, read-back verification, rollback, and bounded self-healing policies.

## What Changes

- Add a durable `agent_runs` / `agent_run_steps` ledger so every agent task survives page switches, refreshes, and long-running tool work.
- Add task contracts with success criteria before high-risk work begins.
- Convert write operations from direct model-to-database writes into verified actions with preconditions, postconditions, read-back checks, and rollback.
- Add draft-first editing for user documents such as resumes, JD records, reports, offer records, and profile facts.
- Add a repair policy engine for transient retry, clarification, rollback, and safe failure.
- Make agent final claims depend on verifier evidence, not model wording.
- Define the Postgres-only production cutover criteria while preserving SQLite as an archive/migration source until rollback is safe.
- Add a scoped agent runtime framework spike comparing the current orchestrator against AutoGen / Microsoft Agent Framework / LangGraph-style runtimes behind an adapter interface.

## Non-Goals

- Do not immediately replace the current orchestrator with AutoGen or any external framework.
- Do not delete SQLite files or dependencies until the Postgres cutover checklist is satisfied.
- Do not make every low-risk query tool require user confirmation.
- Do not rely on an LLM-only self-review as the primary verifier for database writes.
- Do not redesign every UI in this change; only add UI surfaces required for run status, draft approval, and recovery.

## Capabilities

### Added Capabilities

- `agent-quality-runtime`: durable run ledger, task contracts, verifier evidence, and repair policy.
- `verified-write-tools`: draft-first and read-back-verified action tools.
- `postgres-canonical-runtime`: Postgres as production source of truth with explicit SQLite archive retirement gates.

### Related Existing Capabilities

- `agent-loop-client`
- `agent-loop-engine`
- `agent-orchestrator`
- `agent-tools`
- `agent-memory`
- `chat-session-model`
- `cv-version-diff`
- `sqlite-backend`

## Dependencies

- Builds on `add-postgres-pgvector-foundation`, `migrate-sqlite-to-postgres-data`, and `cutover-server-data-to-postgres`.
- Builds on `harden-agent-memory-policy` for task-aware context safety.
- Should land before expanding autonomous write tools or broadening cross-agent collaboration.

## Impact

- Affected areas: agent loop, tool execution, action tools, CV editor, report/JD/offer writes, session persistence, Postgres schema, admin diagnostics, tests, and eval harness.
- Product impact: users can trust that agent work either applies correctly, shows why it did not apply, or rolls back safely.
- Engineering impact: external agent frameworks become replaceable runtimes behind an adapter rather than a whole-app rewrite.
