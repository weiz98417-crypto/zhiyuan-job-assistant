# Architecture

This document describes the current Zhiyuan web application architecture. The old CLI-first `career-ops` pipeline still informs some scripts and docs, but the runtime product is now a Next.js app with server-side agents, multi-user data access, screenshot intake, and optional PostgreSQL/pgvector memory.

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

The Agent chat route is a server-side loop. The browser sends the user message, selected images, session state, and pending confirmations. The server builds context, selects a sub-agent, enforces tool policy, executes tools, and streams text/tool updates back to the UI.

Key modules:

| Module | Responsibility |
| --- | --- |
| `src/lib/agent/orchestrator/index.ts` | Route user intent to the right sub-agent and build prompt context. |
| `src/lib/agent/registry/agents/*` | Agent definitions and tool allowlists. |
| `src/lib/agent/tools/index.ts` | Registers 44 tools and exposes execution helpers. |
| `src/lib/agent/loop/client-runner.ts` | Client-facing loop orchestration, pending save flow, tool execution sequence. |
| `src/lib/agent/loop/server-runner.ts` | Server-side model invocation and stream handling. |
| `src/lib/agent/loop/tool-policy.ts` | Guardrails for interview rebinding, raw report leakage, and tool misuse. |
| `src/components/MarkdownRenderer.tsx` | Sanitized Markdown rendering for readable chat output. |

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

The interview coach stores a session snapshot with the selected JD/resume context.

```text
Launch / bind materials
  -> generate first question
  -> user answers
  -> score and feedback
  -> next question
  -> recap persisted in session history
```

`src/lib/agent/interview-session-state.ts` and `src/lib/agent/interview-rebind-policy.ts` keep the coach anchored to the original materials. This is what prevents the repeated failure mode where the agent asks many questions at once or forgets the JD/resume constraint.

## Data Layer

The data layer has two runtime drivers:

| Driver | Status | Usage |
| --- | --- | --- |
| SQLite | Default | Local/LAN development and current easiest deployment path. |
| PostgreSQL | Optional | Repository-backed server data path and pgvector memory foundation. |

`src/lib/data-repositories.ts` is the canonical data access layer for server routes that need to work across both drivers. It delegates to SQLite by default and PostgreSQL when `DB_DRIVER=postgres`.

`src/lib/server-db.ts` still provides direct SQLite helpers and migrations. It throws when `DB_DRIVER=postgres` unless `ALLOW_SQLITE_LEGACY=1`, which helps reveal routes that still need repository conversion.

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
