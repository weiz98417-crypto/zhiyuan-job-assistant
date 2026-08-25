# Architecture

This document describes the current Zhiyuan web application architecture. The old CLI-first `career-ops` pipeline still informs some scripts and docs, but the runtime product is now a Next.js app with server-side agents, multi-user data access, screenshot intake, PostgreSQL/pgvector memory, and SQLite fallback/archive support.

## System Overview

```text
Browser
  |
  | Next.js pages and React components
  v
src/app
  |-- agent/        AgentChat + SessionList
  |-- cv/           Resume workspace + reference library
  |-- evaluate/     JD/report library
  |-- interview/    Stateful interview coach
  |-- discover/     Job discovery scanner
  |-- admin/        User approval + memory governance
  |
  v
src/app/api
  |-- agent/*       Chat loop, image intake, memory context/writeback
  |-- data/*        Reports, JDs, applications, profile signals
  |-- cv/*          Resume import, optimization, references
  |-- offers/*      Offer records
  |-- offer-reports/* Offer evaluation reports
  |-- scan/*        Discovery queue and discovered jobs
  |-- admin/*       Users, insights, memory governance
  |
  v
src/lib
  |-- agent/        Orchestrator, registry, tools, policies
  |-- memory/       Vector memory, eval harness, governance
  |-- data-repositories.ts
  |-- server-db.ts
  |-- postgres.ts
```

## Agent Runtime

Production Agent execution is owned by a PostgreSQL-backed PM2 Worker. The browser creates an Agent Run, submits durable input or approval commands, and observes cursor-based events; closing the page or losing SSE does not cancel the Run. `legacy`, `shadow`, `worker_readonly`, and `worker_all` modes support staged rollout with exactly one execution owner per Run.

The Runtime checkpoints before model calls and governed side effects. A Worker crash or classified failure therefore resumes the same Run from its latest safe checkpoint. Recovery decisions are bounded and persisted: retry transport/provider failures, repair parameters, compact oversized context, replan with another safe tool, reconcile uncertain effects, or wait for user input. The failed observation is injected into the next model context so a requeued Run does not blindly repeat the same path.

Monitoring, Review, Eval, Admin projection, and alerts consume a transactional outbox. Their latency or failure can create backlog or dead-letter records, but cannot change the Run outcome. Policy admission, idempotency, transaction boundaries, reconciliation, and read-back verification remain synchronous because they protect execution correctness.

Key modules:

| Module | Responsibility |
| --- | --- |
| `src/lib/agent/runtime/durable-agent-run.ts` | Durable commands, legal state transitions, inputs, gates, checkpoints, child Runs, cancellation, and idempotency. |
| `src/lib/agent/runtime/postgres-agent-run-store.ts` | PostgreSQL claim, lease, heartbeat, fencing, event/snapshot/checkpoint transactions, and outbox writes. |
| `src/lib/agent/runtime/agent-worker.ts` | Bounded concurrent execution, deadlines, heartbeat, drain, structured recovery, and safe requeue. |
| `src/lib/agent/runtime/durable-orchestrator-engine.ts` | Rebuild model context, compact it, execute the existing orchestrator, project events, and verify the Run Contract. |
| `src/lib/agent/runtime/governed-tool-attempt.ts` | Persist intent, enforce capability/policy/Gate, execute with cancellation, reconcile, verify, and persist the result. |
| `src/lib/agent/runtime/recovery-supervisor.ts` | Select a bounded recovery action from structured Observation and persistent budgets. |
| `src/lib/agent/runtime/run-evidence-observer.ts` | Consume the outbox and isolate Evidence/Review/Admin projection failures. |
| `src/lib/agent/orchestrator/index.ts` | Route user intent to the right sub-agent and build prompt context. |
| `src/lib/agent/registry/agents/*` | Agent definitions and tool allowlists. |
| `src/lib/agent/tools/index.ts` | Immutable tool definitions and execution helpers; Worker allowlists live in execution context. |
| `src/lib/agent/tool-governance.ts` | Classifies tool side effects, task contract policies, allowed agents, read-back requirements, and route conflicts. |
| `src/lib/agent/task-routing.ts` | Central routing matrix for text intent, image document type, memory policy task, and allowed tools. |
| `src/lib/agent/runtime/durable-run-client.ts` | Browser command/query adapter, SSE cursor resume, and polling fallback. |
| `src/lib/agent/loop/client-runner.ts` | Transitional legacy-mode adapter retained during staged rollout. |
| `src/lib/agent/loop/server-runner.ts` | Shared model/tool cycle used by the Worker orchestrator and legacy mode during migration. |
| `src/lib/agent/loop/tool-policy.ts` | Guardrails for interview rebinding, raw report leakage, and tool misuse. |
| `src/components/MarkdownRenderer.tsx` | Sanitized Markdown rendering for readable chat output. |

Every static tool exposed in `worker_all` calls a principal-scoped server application service; the Worker does not forge cookies or depend on relative HTTP, localStorage, IndexedDB, or DOM. MCP connectors and external services receive the Run AbortSignal and bounded deadlines. Durable writes, exports, and admin actions must return read-back or deterministic verifier evidence before the assistant can claim success.

## Image Intake Flow

Uploads are handled before the general chat model can freely improvise. This prevents JD/offer/resume screenshots from being treated as ordinary chat text.

```text
User uploads image(s)
  |
  v
AgentChat prepares full-size image payloads
  |
  v
/api/agent/image-intake
  |
  v
server-image-intake + image-intake-router
  |-- classify content: JD / offer / resume / unrelated / ambiguous
  |-- OCR or vision extraction through Zhipu GLM vision
  |-- compare user text intent with image content
  |
  v
Route:
  JD      -> evaluate_jd_full
  Offer   -> evaluate_offer
  Resume  -> ask whether to save/import
  Mixed   -> ask clarification
  Other   -> answer as image analysis, with job-search boundary
```

Image variant helpers in `src/lib/server-image-variants.ts` guard against tiny embedded thumbnails. Tests in `src/__tests__/image-thumbnail-guard.test.ts` and `src/__tests__/jd-image-routing.test.ts` cover the routing rules.

## JD Evaluation Flow

```text
Input text/link/screenshot
  -> normalize/extract JD text
  -> optional saved resume/profile lookup
  -> evaluate_jd_full
  -> A-G structured report
  -> summary-first chat response
  -> save report + JD
  -> report library / PDF export
```

The chat boundary is intentional: the assistant should show a compact summary and save the complete A-G report, not paste the full report into the conversation.

## Offer Evaluation Flow

Offer evaluation is separated from JD evaluation. The offer agent owns:

- first-pass single-offer evaluation,
- saved offer report reading,
- negotiation strategy generation,
- HR question list generation,
- explicit multi-offer comparison.

`src/lib/agent/offer-session-state.ts` marks stale report conditions when the user adds new material facts. The agent then asks whether to rerun evaluation instead of silently mixing old and new assumptions.

## Interview Coach Flow

The interview coach stores the selected JD/resume binding and every turn as a read-back-verified session checkpoint. The route is only an authenticated protocol adapter; model calls, fallback questions, scoring, memory writeback, idempotent turn recovery, and persistence live in the shared interview application service.

```text
Launch / bind materials
  -> generate first question
  -> user answers
  -> score and feedback
  -> next question
  -> checkpoint and read back after every turn
  -> recap persisted in the same session history
```

`src/lib/agent/interview-session-state.ts` and `src/lib/agent/interview-rebind-policy.ts` keep the coach anchored to the original materials. This is what prevents the repeated failure mode where the agent asks many questions at once or forgets the JD/resume constraint.

## Data Layer

The data layer has two runtime drivers. The current LAN deployment uses PostgreSQL/pgvector; SQLite remains for local fallback, migration, and archive reads.

| Driver | Status | Usage |
| --- | --- | --- |
| PostgreSQL | Production and current LAN runtime | Repository-backed business data, durable Run state, Tool Attempts, checkpoints, outbox, reviews, and pgvector memory. |
| SQLite | Fallback/archive | Local lightweight mode, migration source, and readonly archive path. |

`src/lib/data-repositories.ts` is the canonical data access layer for server routes that need to work across both drivers. It delegates to PostgreSQL when `DB_DRIVER=postgres`; otherwise it can use SQLite fallback.

`src/lib/server-db.ts` still provides direct SQLite helpers and migrations for fallback/archive scenarios. It throws when `DB_DRIVER=postgres` unless `ALLOW_SQLITE_LEGACY=readonly`, which helps reveal routes that still need repository conversion.

## Long-Term Memory

Long-term memory is built around approved reference resumes and feedback signals.

```text
Reference resume
  -> parse sections
  -> require role confirmation
  -> private or team_pending visibility
  -> chunk and embed
  -> retrieve by role/JD/task
  -> use as guidance, not raw text
  -> collect accepted/rejected feedback
  -> promote or demote patterns
```

Important modules:

| Module | Responsibility |
| --- | --- |
| `src/lib/reference-resume-vector.ts` | Reference resume chunking, indexing, retrieval, no-copy overlap checks. |
| `src/lib/memory/vector-memory.ts` | Embedding provider abstraction and vector item storage. |
| `src/lib/memory/eval-harness.ts` | Deterministic memory evals. |
| `src/lib/memory/feedback-promotion.ts` | Promote useful memory patterns based on feedback. |
| `src/lib/memory/governance.ts` | Admin queues and health checks for shared memory. |
| `src/app/admin/memory/page.tsx` | Admin-only memory governance console. |

## Auth And Tenant Boundaries

Most durable records are user-scoped with `user_id`. Private data includes reports, JDs, offers, sessions, profile signals, CV data, applications, and reference resumes.

Team-shared excellent resumes are not visible to other users until approved. Pending team references and private references are only retrievable by their owner.

## Background And Utility Scripts

Scripts support setup, database checks, migration, memory backfill, profile cleanup, and discovery worker tasks. See [SCRIPTS.md](SCRIPTS.md).

## OpenSpec Workflow

OpenSpec changes under `openspec/changes/` document the implementation plan for each major capability. Completed work in this PR includes:

- PostgreSQL + pgvector foundation.
- SQLite to PostgreSQL migration tooling.
- Server data repository cutover.
- Vector long-term memory store.
- Agent integration with long-term memory.
- Memory eval harness.
- Memory feedback promotion.
- Admin memory governance UI.
- Hardened memory/tool policies.
- Durable Agent Run, governed Tool Attempts, bounded Recovery Supervisor, and asynchronous Evidence observer.
- Dedicated PM2 Agent Worker and Alibaba Cloud release/rollback runbook.
