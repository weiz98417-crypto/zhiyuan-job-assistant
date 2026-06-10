# Design: harden-agent-quality-runtime

## Context

The current agent system is powerful but brittle because the chat loop, model reasoning, tool execution, persistence, and success messaging are too tightly coupled. A model can directly call a write tool with bad content, and the app may save it before proving the result is correct. Client-held state also makes long runs fragile when the browser tab refreshes, switches, or loses streaming context.

This change introduces a quality runtime where high-risk agent work is treated like a transaction with evidence.

## Principles

1. AI edits are proposals before they are durable writes.
2. Action tools must prove success by reading back state.
3. The model cannot claim success unless the runtime verifier passed.
4. Every durable mutation must have an audit trail and rollback path.
5. Self-healing must be bounded; retries cannot loop indefinitely or perform destructive writes blindly.
6. Agent framework choice is secondary to enforceable contracts and verifiers.

## Architecture

### Agent Run Ledger

Add durable run records:

- `agent_runs`
  - `id`
  - `user_id`
  - `session_id`
  - `task_type`
  - `agent_id`
  - `status`: `planned | running | waiting_user | verifying | repairing | succeeded | failed | rolled_back | cancelled`
  - `contract_json`
  - `result_json`
  - `error_json`
  - `created_at`
  - `updated_at`

- `agent_run_steps`
  - `id`
  - `run_id`
  - `phase`
  - `tool_name`
  - `status`
  - `input_summary`
  - `output_summary`
  - `verifier_json`
  - `error_json`
  - `created_at`

The UI can recover an active run from the ledger after refresh or session switch.

### Task Contract

Before executing high-risk work, the runtime creates a contract:

```json
{
  "taskType": "resume_edit",
  "target": "cv.projects",
  "requiresUserApproval": true,
  "baseVersion": "v1",
  "baseHash": "sha256...",
  "successCriteria": [
    "draft generated",
    "user approved draft",
    "target section read-back hash matches applied content",
    "content validator passes",
    "version snapshot created"
  ]
}
```

Contracts are deterministic data used by the runtime and UI, not just prompt text.

### Verified Write Tools

High-risk action tools should follow a standard protocol:

1. Validate preconditions.
2. Create draft or mutation plan.
3. If approval is required, return `waiting_user` with a diff.
4. On approval, apply inside a transaction.
5. Read back the changed record.
6. Run validators on the read-back result.
7. Create a version/audit record.
8. Return success evidence.

For resume edits, the model should call `create_resume_edit_proposal`, not directly overwrite a section. `apply_resume_edit_proposal` performs the write after user approval and expected base hash verification.

### Verifier Types

Use deterministic verifiers first:

- schema validation
- base hash / optimistic concurrency checks
- read-back equality checks
- content length and placeholder checks
- no unsupported markdown/code fences in document fields
- required field presence
- generated file existence and size checks

Use LLM verifiers only for semantic quality checks, never as the only proof that a database write succeeded.

### Repair Policy

Every failure has a policy:

- `transient`: retry with exponential backoff, max 2.
- `validation_failed`: do not write; return draft with failure reason.
- `read_back_mismatch`: rollback or mark failed; never claim success.
- `base_version_conflict`: ask user to review new diff.
- `unclear_intent`: ask one clarification question.
- `destructive_risk`: require explicit user approval.

The policy engine records the chosen action in `agent_run_steps`.

### Postgres Canonical Runtime

Postgres becomes the production source of truth only when:

- all runtime repositories use `getDataRepositories()` and respect `DB_DRIVER=postgres`
- SQLite code paths are not imported by production server routes when Postgres is active
- migration verification proves row counts and hashes for sessions, CV data, reports, JDs, offers, profile signals, memories, and reference resumes
- backups and restore scripts exist for Postgres
- rollback is defined before SQLite archive removal

SQLite may remain as a read-only archive until the above gates pass.

### Agent Framework Spike

Create an adapter:

```ts
interface AgentRuntimeAdapter {
  run(input: AgentRunInput): AsyncIterable<AgentRunEvent>;
  cancel(runId: string): Promise<void>;
  resume(runId: string): AsyncIterable<AgentRunEvent>;
}
```

Then compare:

- current orchestrator
- AutoGen / AgentChat-style runtime
- Microsoft Agent Framework
- LangGraph-style graph runtime

The spike uses one flow only: resume optimization -> draft diff -> approval -> verified apply -> rollback test. The decision is based on measured reliability, state recovery, tool governance, integration cost, and developer ergonomics.

## Risks / Trade-offs

- Users will see more approval steps for high-risk writes. This is acceptable because silent data corruption is worse.
- The run ledger adds schema and UI complexity. It pays for itself by making agent work recoverable and debuggable.
- External frameworks can help multi-agent coordination, but a premature migration can delay the actual safety fix.
- Strict validators can reject some valid short edits. The UI should let users save manual edits directly while agent writes remain stricter.

## Migration Strategy

1. Add schema and repository methods behind feature flags.
2. Wrap one painful flow first: resume section edits.
3. Prove draft/apply/rollback with tests and manual QA.
4. Extend the protocol to JD/report/offer/profile writes.
5. Add run recovery UI.
6. Run framework spike after verified writes exist, not before.
