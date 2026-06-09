# Change: wire-agents-to-long-term-memory

## Why

Once PostgreSQL and vector memory exist, agents must use them deliberately. JD evaluation, offer evaluation, resume optimization, and interview coaching should retrieve the right long-term context instead of relying on whatever the chat model remembers.

## What Changes

- Add an agent memory context assembly layer.
- Update agent tools to combine structured facts and semantic retrieval.
- Bind interview sessions to JD/resume/report snapshots across turns.
- Write useful post-task learnings back as candidate memory, not confirmed truth.
- Add tests proving agents retrieve relevant memory without crossing user boundaries.

## Capabilities

### New Capabilities

- `agent-long-term-memory-integration`: Agent retrieval and writeback behavior using structured and semantic long-term memory.

### Modified Capabilities

- None.

## Impact

- Affected areas: agent context, `get_profile`, `get_recent_jd_context`, `detect_skill_gaps`, JD/offer/resume tools, interview coach, agent loop context budget, tests.
- Depends on `add-vector-long-term-memory-store` and `harden-profile-signal-quality-gate`.
