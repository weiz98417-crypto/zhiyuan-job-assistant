# 0023 - The durable worker is the sole execution owner

Date: 2026-09-24

## Status

Accepted (completes ADR-0004 and ADR-0022)

## Context

ADR-0004 declared a dedicated agent worker owns run execution and ADR-0022 planned a flag-gated migration ending in one production cutover. The cutover commit landed, but the legacy execution paths were never removed: `client-runner.ts` (browser-side ReAct loop writing Dexie directly), `remote-runner.ts`, and the `directMode` branch of `/api/agent/run` all remained, and `AGENT_RUNTIME_MODE` still defaults to `legacy`. Production evidence (agent-production-e2e-issues-2026-08-30, sessions 112/119) showed the same request type producing different execution paths and different outcomes: path selection depends on whether regex routing resolves a task type (unresolved types fall back to legacy wholesale), the worker_readonly task filter, and durable-creation errors — and once on different paths the two loops behave differently, since the legacy loop carries seven first-iteration forced tool calls the worker does not have. Cohort bucketing itself is deterministic per user and is not a divergence source. Maintaining the loop logic in two hand-ported copies already caused drift (dedup cache conditions and followup instructions diverged).

## Decision

The PostgreSQL-backed worker is the only execution owner. We delete `client-runner.ts` (verified dead in production), `remote-runner.ts`, and the directMode branch, after closing five worker-path gaps: interview state passing, server-side prompt context rebuild, contract rebuild including client journey artifacts, the three UI-facing event families (persist_done, search progress, offer state derivation), and image-intake routing into server-side Run Admission. `AGENT_RUNTIME_MODE` collapses to `worker_all`. The browser speaks only to the durable run client (submit turn, respond to gate, consume cursor events). Model calls consolidate into a single gateway module replacing three duplicated MODEL_CHAIN/streaming-parser copies.

## Consequences

Behavior parity is the M1 acceptance gate: the eleven short-chain E2E scenarios and gate persistence (PE2E-UI-001) must pass on the worker path before deletion merges. Every future loop fix lands in exactly one place; the "same bug, different path" class of production incidents disappears. The browser loses nothing observable — local Dexie remains a session cache only, and no offline capability was ever a product requirement.
