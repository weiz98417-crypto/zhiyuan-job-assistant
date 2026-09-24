# 0030 - The worker is the sole transcript writer; the items materialization is deleted

Date: 2026-09-25

## Status

Accepted (clarifies ADR-0020)

## Context

The session transcript had two full-replacement writers: the worker saved the whole messages array before and after execution, and the browser PATCHed whole arrays for status notices and flow bookkeeping — neither with any concurrency control. A late client write could erase the worker's just-persisted final reply. Post-run refreshes replaced the local list wholesale, so optimistic content could flicker away or revert. Meanwhile the conversation-items materialized table (planned under ADR-0020) never had a writer or a reader: it was an organ that was never connected.

## Decision

The worker is the sole writer of the transcript. The session mutation interface rejects the messages field from browsers outright (422) — status notices become UI-transient (rendered from run state, never persisted), and guided-flow persistence narrows to the session's state fields. Client refreshes merge per stable item identity instead of replacing the list: the server forms the skeleton, local optimistic items interleave by timestamp and survive until acknowledged; a periodic messages-snapshot event reconciles drift. The never-powered items table, its store and its preflight expectations are deleted; the read model is the existing deterministic projection endpoint computed from persisted events.

## Consequences

Lost-update between browser and worker is structurally impossible rather than guarded; refresh cannot silently reorder or drop what the user just saw. The projection vocabulary is smaller (one dead read model gone); if materialization ever becomes a real need, it returns as a decision backed by measured cost. Client writes to conversation content flow exclusively through durable runs, matching ADR-0003's "Postgres is the source of truth" posture.
