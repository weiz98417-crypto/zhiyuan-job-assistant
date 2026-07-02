# 筝筝纸鸢 (Zhiyuan) — AI Job Search Assistant

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-000?style=flat&logo=next.js&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL_pgvector-runtime-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL pgvector">
  <img src="https://img.shields.io/badge/SQLite-fallback-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite fallback">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

Zhiyuan is a local-first AI job search assistant for the Chinese market. It evaluates JDs, optimizes resumes, simulates interviews, compares offers, and turns high-quality resume examples into governed long-term memory for future resume iteration.

> Zhiyuan is not a mass-application tool. It helps candidates filter opportunities, understand tradeoffs, and prepare deliberately.

## What It Does

### Conversational Agent

- 6 routed sub-agents: Resume, Evaluate, Interview, Profile, Offer, and General.
- 48 registered tools: 15 query tools, 26 action tools, 2 interview tools, and 5 MCP shims.
- Server-side agent loop keeps API keys off the browser and applies per-agent tool policy.
- Tool governance classifies every tool by side effect and blocks contract mismatches before execution, so guidance, write, export, and admin flows cannot silently steal each other's routes.
- Markdown rendering and compact tool cards keep chat output readable instead of dumping raw reports.
- Image intake router classifies uploaded screenshots as JD, offer, resume, or unrelated content before dispatching the right workflow.

### JD Evaluation

- Supports pasted text, links, and screenshots.
- Screenshot flow uses Zhipu vision/OCR and image-variant guards to avoid sending tiny chat thumbnails when a full-size image is available.
- Full A-G evaluation covers overview, resume match, level strategy, compensation/market, customization plan, interview prep, and legitimacy/risk.
- Reports are persisted and can be reviewed in the report library or exported as PDF.

### Offer Evaluation

- Single-offer evaluation stores structured offer reports with score, verdict, missing information, red flags, negotiation levers, HR questions, and take-home assumptions.
- Offer conversations can reuse saved reports for interpretation, negotiation strategy, and HR question lists without rerunning evaluation unless the user asks.
- Multi-offer comparison remains a separate explicit workflow.

### Resume Optimization And Excellent Resume Memory

- Resume import, section optimization, ATS checks, and PDF generation are available from the CV workspace and Agent chat.
- Users can save a resume as an excellent reference only after an explicit role-category confirmation, for example AI Product Manager, AI Operations, or AI Presales.
- Reference resumes are chunked, embedded, and retrievable as style/structure guidance while no-copy policy guards prevent raw copying.
- Team-shared memories go through admin governance before other users can retrieve them.

### Interview Coach

- Interview sessions bind to the selected JD and resume snapshot.
- The coach asks one question at a time, preserves JD/resume context, scores answers, supports follow-up questions, and stores structured recaps.
- Rebinding to a new JD or resume is policy-gated so an active mock interview does not silently drift.

### Profile And Discovery

- Profile signal extraction now uses a quality gate to reject fragments, generic words, and low-value snippets.
- Discovery scanning tracks jobs per user, de-duplicates postings, saves discovered JDs, and exposes scan/job status in the UI.

### Admin And Team Memory Governance

- Multi-user auth supports pending approvals and admin user management.
- Admin memory console reviews team-shared excellent resumes, disabled references, stale pending embeddings, and failed reindex jobs.
- Team insight APIs summarize active users, pending approvals, and memory/library activity.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Agent runtime | Custom ReAct-style loop, tool registry, per-agent prompts, streaming responses |
| AI providers | DeepSeek for chat/evaluation, Zhipu GLM vision for screenshots, DashScope/OpenAI-compatible embeddings |
| Current LAN database | PostgreSQL with pgvector, selected by `DB_DRIVER=postgres` |
| Fallback/archive database | SQLite via `better-sqlite3` |
| Memory | Reference resume vectors, memory chunks/items, feedback promotion, eval harness |
| PDF/export | Playwright, HTML/CSS templates, report export routes |
| Tests | Vitest, TypeScript, deterministic memory evals |

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run doctor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Required environment variables:

```bash
DEEPSEEK_API_KEY=sk-...
ZHIPU_API_KEY=...
JWT_SECRET=replace-with-a-random-32-char-secret
```

Optional for web search, map tools, and embeddings:

```bash
SERPAPI_API_KEY=...
BAIDU_MAP_API_KEY=...
MEMORY_EMBEDDING_PROVIDER=openai-compatible
MEMORY_EMBEDDING_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
MEMORY_EMBEDDING_MODEL=text-embedding-v4
MEMORY_EMBEDDING_DIMENSION=1536
MEMORY_EMBEDDING_API_KEY=...
```

For LAN testing on Windows:

```powershell
.\start-lan.ps1
```

The first registered user becomes the active admin. Later users register as pending and must be approved from the admin user console.

## PostgreSQL And pgvector

The current LAN deployment uses PostgreSQL/pgvector through the repository-backed server data path. SQLite remains in the project as a local fallback, migration source, and archive-read path.

Check the target database:

```bash
npm run check:postgres
```

Migrate SQLite data into PostgreSQL without switching runtime:

```bash
npm run migrate:postgres -- --dry-run --default-owner admin --report reports/postgres-migration-dry-run.md
npm run migrate:postgres -- --apply --default-owner admin --report reports/postgres-migration-apply.md
npm run check:postgres-migration -- --default-owner admin --report reports/postgres-migration-verify.md
```

Runtime configuration:

```bash
DB_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
```

After switching, run:

```bash
npm run check:postgres-cutover
```

See [docs/POSTGRES_MIGRATION.md](docs/POSTGRES_MIGRATION.md) for the full runbook.

## Agent Tool Governance

Every registered agent tool must declare governance metadata: side effect, allowed task types, agent allowlist, confirmation requirement, read-back requirement, success contract, and Chinese display name. Development and test environments default-deny tools missing this metadata.

When adding or changing a tool, follow [docs/AGENT_TOOL_GOVERNANCE.md](docs/AGENT_TOOL_GOVERNANCE.md) and run the routing/governance evals before shipping.

## Verification

```bash
npm run test
npm run eval:memory
npm run smoke:embedding
npm run build
```

`eval:memory` is deterministic and does not call live model providers. `smoke:embedding` is opt-in and uses configured embedding credentials.

## Project Structure

```text
src/
  app/
    agent/            Agent chat surface
    admin/            User approval, team insights, memory governance
    cv/               Resume workspace and reference resume library
    discover/         Job discovery scanner
    evaluate/         JD library and report library
    interview/        Stateful mock interview UI
    compare/          Offer comparison
    api/              REST/SSE routes
  components/
    agent/            AgentChat, SessionList
    shell/            Shared app shell
  lib/
    agent/            Orchestration, tool registry, image intake, memory policy
    memory/           Vector memory, eval harness, feedback promotion, governance
    data-repositories.ts
    postgres.ts
    postgres-schema.sql
    server-db.ts       SQLite fallback/archive adapter
scripts/
  migrate-sqlite-to-postgres.mjs
  check-postgres.mjs
  check-postgres-migration.mjs
  backfill-memory.mjs
  cleanup-profile-signals.mjs
docs/
  README.md
  ARCHITECTURE.md
  SETUP.md
  SCRIPTS.md
  POSTGRES_MIGRATION.md
  MEMORY_EVALS.md
openspec/
  changes/
  plans/
```

## Documentation

- [docs/README.md](docs/README.md): documentation map.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): runtime architecture and data flow.
- [docs/SETUP.md](docs/SETUP.md): local, LAN, and PostgreSQL setup.
- [docs/SCRIPTS.md](docs/SCRIPTS.md): script reference.
- [docs/POSTGRES_MIGRATION.md](docs/POSTGRES_MIGRATION.md): SQLite to PostgreSQL migration runbook.
- [docs/MEMORY_EVALS.md](docs/MEMORY_EVALS.md): memory eval and embedding smoke checks.

## Acknowledgement

This project began as a fork of [career-ops](https://github.com/bengous/career-ops) by [Ben Gou](https://github.com/bengous). Zhiyuan extends that foundation into a multi-user web application with conversational agents, Chinese-market JD/offer evaluation, resume optimization, interview coaching, image intake, and governed long-term memory.

## Disclaimer

- Keep private resumes, offers, and reports under your own deployment control.
- AI outputs need human review before sending to employers.
- Evaluation scores are decision support, not guarantees.
- Licensed under [MIT License](LICENSE).
