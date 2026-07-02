# Agent Tool Governance

This project treats agent tools as governed product capabilities, not just model-call helpers. A tool can read data, guide the user, write durable state, export files, or perform admin actions. The runtime must know that before a model can call it.

## Core Rule

Every registered tool must have `ToolGovernance` metadata in `src/lib/agent/tool-governance.ts`:

- `effect`: `read`, `guide`, `write`, `high_risk_write`, `export`, `admin`, or `internal`.
- `allowedTaskTypes`: task contracts where the tool may run.
- `agentAllowlist`: agents allowed to call it.
- `requiresUserConfirmation`: true for high-risk user-controlled writes.
- `requiresReadBack`: true when success depends on durable state, export output, or admin mutation.
- `successContract`: what evidence proves the tool actually succeeded.
- `conflictPriority`: deterministic tie-breaker for overlapping routes.
- `userVisibleNameZh`: Chinese display name for debug and UI.

In development and tests, tools missing governance metadata are default-denied. Production keeps a temporary legacy compatibility path only for rollout safety, and new tools should not rely on it.

## Task Contract Policies

The routing matrix maps user intent and document type to a task contract:

| Policy | Intended Use | Allowed Outcome |
| --- | --- | --- |
| `guidance` | self-positioning, coaching, advice | next question or guidance response |
| `read_only` | inspect, summarize, compare without saving | no durable write |
| `verified_write` | normal persisted workflow | read-back or verifier evidence |
| `high_risk_verified_write` | resume/profile/memory/report mutation | confirmation plus read-back/verifier evidence |
| `export_verified` | file/PDF export | file exists, non-zero size, hash/download verified |
| `admin_verified` | approve/reject/delete/govern | permission check plus status transition feedback |

If a model calls a tool that conflicts with the active contract, runtime governance blocks it and records a route mismatch instead of letting the assistant claim success.

## Adding A Tool Safely

1. Register the tool in the existing tool registry.
2. Add governance metadata in `TOOL_GOVERNANCE_REGISTRY`.
3. If it writes, exports, or administers data, add deterministic read-back evidence to the `ToolResult`.
4. Add or update task routing in `src/lib/agent/task-routing.ts` if the tool introduces a new flow.
5. Add regression tests for the route, blocked mismatch, and success evidence.
6. Run:

```bash
npm.cmd test -- src/__tests__/agent-tool-governance.test.ts src/__tests__/agent-task-routing.test.ts src/__tests__/agent-quality-runtime-foundation.test.ts
npx.cmd tsc --noEmit
```

## Known Failure Evals

The governance test suite must keep covering these classes of failures:

- Self-positioning must stay guidance-only unless the user explicitly asks to save profile facts.
- JD/Offer/resume images must classify document type before ordinary chat or business tools run.
- Resume edits must create draft/proposal state first and must not claim final save without apply/read-back.
- Excellent resume memory must ask for role category before embedding or sharing.
- Candidate memory approve/reject must show UI feedback and return status-transition evidence.
- Profile signal extraction must reject fragments, generic words, JD requirement snippets, and unrelated chat noise.
