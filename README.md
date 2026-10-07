# 纸鸢 Agent (Zhiyuan) — AI Job Search Assistant

[简体中文](README.cn.md) · [Documentation](docs/README.md) · [Release history](src/app/changelog/release-notes.ts)

![Version](https://img.shields.io/badge/release-0.13.2-b74432)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61dafb)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169e1)
![License](https://img.shields.io/badge/license-MIT-blue)

Zhiyuan is a self-hosted AI job search workspace for the Chinese market. It connects job evaluation, resume editing, interview practice, application tracking, offer comparison, and governed career memory. The product UI uses **纸鸢 Agent**; the former repository name was 筝筝纸鸢.

Start with the daily journal to turn saved opportunities into today's next action: prepare for an interview, follow up on an application, or act on an evaluated JD.

## Current release: 0.13.2

The production release published on **October 7, 2026 (Asia/Shanghai)** is `0.13.2`. The default GitHub branch is `master`; `VERSION` and `package.json` record the application version. Pushing a branch and deploying production are separate operations.

| Release | Highlights |
| --- | --- |
| 0.13.2 | Daily journal visual update: dark kite artwork, two notebook illustrations, and a stage-node opportunity journey. |
| 0.13.1 | Today focus, prioritized action queue, progress summary, responsive layouts, and loading/error/empty states. |
| 0.13.0 | MiMo voice input/playback, resume factuality checks, interview rubric and question bank, salary evidence, and Agent trace visibility. |

Detailed user-facing notes are available at `/changelog` and in [release-notes.ts](src/app/changelog/release-notes.ts). Future milestone numbers in planning documents do not establish a production release.

## Product capabilities

| Workspace | Route | What it does |
| --- | --- | --- |
| Daily journal | `/` | Prioritizes interviews, follow-ups, and evaluated opportunities; shows stage counts, industry news, and company news. |
| Agent | `/agent` | Conversational tasks with a journey rail, progress, approval cards, and a separate analysis panel. |
| Resume | `/cv` | Import, edit, optimize, compare versions, check ATS fit, and generate PDFs. |
| JD evaluation | `/evaluate`, `/evaluate/jds`, `/evaluate/reports` | Evaluate text, links, or screenshots and retain JDs and structured reports. |
| Application tracker | `/tracker` | Manage application states, follow-ups, and interview arrangements. |
| Interview coach | `/interview` | Practice against a selected JD and resume; review follow-ups, rubric-based feedback, and recaps. |
| Offers | `/compare` | Evaluate an offer or compare compensation, benefits, risks, and negotiation options. |
| Discovery | `/discover` | Scan configured sources, de-duplicate opportunities, and review discovery/digest status. |
| Career profile | `/profile` | Review skills, preferences, gaps, and profile evolution. |
| Memory | `/memory` | Inspect and govern personal career memory. |
| Analytics and exploration | `/analytics`, `/explore` | Review job search data and explore career questions. |
| Settings and releases | `/settings`, `/changelog` | Manage preferences and inspect historical changes. |
| Administration | `/admin/*` | User approval, security events, team memory, Agent runs/traces, and review evidence, subject to role permissions. |

### Agent execution and tool governance

- A system orchestrator coordinates Resume, Evaluate, Interview, Profile, Offer, and General agents.
- Web admits tasks; a separate PostgreSQL-backed Worker executes them and writes the durable conversation transcript.
- Runs retain events, checkpoints, tool attempts, budgets, and recovery state. Closing a browser does not transfer execution ownership.
- Tool policy declares side effects, permitted tasks/agents, confirmation, read-back, and success requirements. Sensitive writes use approval flows.
- Image intake distinguishes JD, offer, resume, and unrelated screenshots before selecting a workflow.
- Production traces retain execution metadata for debugging and cost visibility. See [Agent specifications](docs/agent-system-specs/README.md).

### Resume quality and career memory

- Resume optimization supports role-specific writing guidance, JD targeting, reference style, and multiple rewrite operations/intensities.
- Text PDFs use local extraction; DOCX uses Mammoth. Scanned or unreadable PDFs can use a separately configured MinerU installation; images use DeepSeek vision.
- Generated resume artifacts pass factuality checks. Missing metrics require user-supplied evidence rather than invented achievements.
- Excellent reference resumes require an explicit role category. Team sharing requires admin approval before retrieval by other users.
- Layered memory governs session context, evidence, facts, and profile information, including scoped erasure and retrieval restrictions.

### Interview, voice, and decision support

- Interview sessions bind to JD/resume context, with question-bank practice, bounded follow-ups, evidence-based scoring, and recaps.
- MiMo ASR transcribes recorded answers; MiMo TTS reads assistant replies sentence by sentence in Agent sessions. DeepSeek generates the replies.
- Voice is turn-based, with a stop-playback control. Continuous streaming recognition and automatic interruption are future work.
- JD reports cover A–G analysis. Offer reports preserve missing information, risks, negotiation levers, and compensation assumptions.
- Salary benchmarks and feedback retain source/evidence information. Scores and benchmarks support decisions and require human review.

### Homepage artwork

The `0.13.2` daily journal uses all three supplied illustrations, brand colors, layered composition, and microanimations that respect reduced-motion preferences. These are artwork assets, not application screenshots:

| Asset | Role |
| --- | --- |
| [paper-kite-hero.png](public/art/paper-kite-hero.png) | Main kite illustration for today focus. |
| [journal-empty.png](public/art/journal-empty.png) | Open-notebook illustration. |
| [journal-complete.png](public/art/journal-complete.png) | Completed-notebook illustration. |

## Architecture and technology

```mermaid
flowchart LR
    Browser[Browser workspace] --> Web[Next.js Web / APIs]
    Web --> PG[(PostgreSQL + pgvector)]
    Web --> Redis[(Auth Redis)]
    PG <--> Worker[Durable Agent Worker]
    Worker --> DeepSeek[DeepSeek text / vision]
    Worker --> MCP[Governed MCP tools]
    Web --> MiMo[MiMo ASR / TTS]
    Web --> Files[Shared artifacts]
    Worker --> Files
```

| Layer | Technology |
| --- | --- |
| UI | Next.js 16.4, React 19, TypeScript, Tailwind CSS 4, Framer Motion, assistant-ui, Radix UI, Recharts. |
| Execution | Custom durable Agent runtime, task programs, event/checkpoint ledger, standalone Node.js Worker. |
| Main model | DeepSeek `deepseek-flash` for text, evaluation, and image recognition. |
| Voice | Xiaomi MiMo `mimo-v2.5-asr` / `mimo-v2.5-tts`; default voice 白桦. |
| Authoritative storage | PostgreSQL with pgvector; Redis for authentication rate limits/security. |
| Compatibility storage | SQLite fallback/archive and migration source; browser IndexedDB for selected local data. |
| Memory | PostgreSQL fact/evidence stores, Mastra session memory, optional OpenAI-compatible embeddings. |
| Import and export | pdf-parse, Mammoth, optional MinerU, Playwright Chromium, shared PDF/export services. |
| Validation | Vitest, TypeScript, deterministic Agent/capability evals, Promptfoo, optional live/visual checks. |
| Production | Nginx HTTPS, PM2 Web + Worker, immutable releases, shared secrets/artifacts, atomic release symlink. |

## Local setup

### Requirements

- **Node.js 24 LTS and npm** are recommended, matching CI. Some validation dependencies require Node.js 22.22 or newer.
- PostgreSQL with the `vector` extension, plus Redis for login/security flows.
- A DeepSeek API key for AI features; a MiMo key only if voice is needed.
- Playwright Chromium for PDF rendering and browser-based discovery; optional MinerU for scanned documents.

SQLite supports compatibility/local data paths but does not replace PostgreSQL for the current durable Agent. Starting only `npm run dev` is insufficient for Agent task execution.

### 1. Install and configure

```bash
git clone https://github.com/weiz98417-crypto/zhiyuan-job-assistant.git
cd zhiyuan-job-assistant
npm ci
cp .env.example .env.local
npm run install:playwright
```

In PowerShell, replace `cp` with `Copy-Item .env.example .env.local`. Run npm commands from the repository root; there is no `frontend/` subdirectory.

Edit `.env.local` with your own local credentials:

```dotenv
DEEPSEEK_API_KEY=replace_with_your_key
DEEPSEEK_MODEL=deepseek-flash
JWT_SECRET=replace_with_an_independent_random_secret_of_at_least_32_characters
DB_DRIVER=postgres
DATABASE_URL=postgresql://zhiyuan_app:replace_with_local_password@127.0.0.1:55432/zhiyuan_job_assistant
REDIS_URL=redis://:replace_with_local_password@127.0.0.1:6380/0
AGENT_RUNTIME_MODE=worker_all
AGENT_ARTIFACT_DIR=./data/agent-artifacts
```

Use existing local PostgreSQL/Redis services, or prepare Docker secrets and services following the [authentication runbook](docs/AUTH_SECURITY_RUNBOOK.md). The [Compose file](deploy/auth-security/docker-compose.yml) provides pgvector/PostgreSQL 16 and Redis 7.4.

### 2. Initialize the local database and Worker

For a new local database, apply the schema using `psql` and the same database URL configured above:

```bash
psql --dbname="<your-local-database-url>" -v ON_ERROR_STOP=1 -f src/lib/postgres-schema.sql
mkdir -p data/agent-artifacts
npm run check:postgres
npm run build:worker
npm run check:agent-runtime
```

PowerShell directory creation: `New-Item -ItemType Directory -Force data/agent-artifacts`.

For an existing database, follow the migration runbooks, take a backup, and verify the schema before switching the runtime. Preflight checks schema, memory gates, model configuration, Worker artifact, and writable artifact storage.

### 3. Start both processes

```bash
# Terminal 1: Web
npm run dev
```

```bash
# Terminal 2: Agent Worker, from the same repository root
node --enable-source-maps build/agent-worker.mjs
```

Open [http://localhost:3000](http://localhost:3000). Rebuild and restart the Worker after changing its source. On Windows, `start-lan.ps1` provides a LAN Web launcher; run the Worker separately.

Register at `/register`. If there is no active privileged account, the first registration becomes an active `superadmin`; subsequent accounts require approval at `/admin/users`.

## Optional integrations

| Variables | Purpose |
| --- | --- |
| `MIMO_API_KEY`, `MIMO_BASE_URL`, `MIMO_TTS_MODEL`, `MIMO_ASR_MODEL`, `MIMO_TTS_VOICE` | Voice input/playback. No key means no voice entry; microphone use requires HTTPS or localhost and browser permission. |
| `MEMORY_EMBEDDING_PROVIDER`, `MEMORY_EMBEDDING_API_URL`, `MEMORY_EMBEDDING_API_KEY`, `MEMORY_EMBEDDING_MODEL`, `MEMORY_EMBEDDING_DIMENSION` | Semantic retrieval via OpenAI-compatible embeddings; DashScope `text-embedding-v4` is a supported configuration. |
| `SERPAPI_API_KEY`, `BAIDU_MAP_API_KEY` | Optional search/map MCP integrations. See `mcp.config.json`. |
| `MINERU_EXECUTABLE`, `MINERU_MODEL_SOURCE`, `MINERU_TOOLS_CONFIG_JSON`, `MINERU_EXTRACTION_TIMEOUT_MS` | Scanned-document extraction; see [setup](docs/SETUP.md). |
| `APP_ORIGIN`, `AUTH_COOKIE_SECURE`, `CSRF_SECRET`, `AUTH_RATE_LIMIT_SECRET`, `APP_BIND_HOST` | Production origin, cookies, request validation, rate limits, and binding; see the security runbook. |

Store provider credentials in server environment files, never in browser-facing `NEXT_PUBLIC_*` variables. Use independent production secrets and share the verified production configuration between Web and Worker.

## Validation

| Command | Scope |
| --- | --- |
| `npm test` | Full Vitest suite. |
| `npx tsc --noEmit` | Type checking. |
| `npm run lint` | ESLint. |
| `npm run build:production` | Build both Web and Worker. |
| `npm run eval:agent-pr` | Deterministic Agent projections, journeys, and eval contracts. |
| `npm run eval:memory` | Deterministic memory evals. |
| `npm run verify:capability-2026-10b` | Knowledge/prompt guards and capability evals. |
| `npm run eval:redteam:build` then `npm run eval:redteam:core` | Deterministic red-team checks used in CI. |
| `npm run check:agent-runtime` | Runtime readiness against the configured database. |
| `npm run security:preflight` | Production authentication/topology checks. |

Optional live checks include `npm run smoke:embedding`, `npm run smoke:voice`, Agent staging/release evals, and `npm run verify:resume-visual`. They need the relevant credentials/services; visual checks also require Chromium. The voice smoke script reads process environment or `.env`; to use `.env.local`, run `node -r dotenv/config scripts/smoke-voice-mimo.mjs dotenv_config_path=.env.local`. A skipped check is not a successful live validation.

Use a dedicated disposable database for integration/fault-injection tests. The [CI workflow](.github/workflows/capability-evals.yml) runs core red-team and capability evals on `master`/`dev` pushes and pull requests; it does not deploy production.

## Production release and rollback

The supported deployment runs Nginx in front of PM2-managed `zhiyuan-web` and `zhiyuan-agent-worker`, with PostgreSQL/pgvector and auth Redis. Web binds to `127.0.0.1:3100`; the current deployment's public entry uses HTTPS port `38084`.

```text
/root/zhiyuan-job-assistant/
  current -> releases/<release-id>
  releases/<release-id>/
  shared/secrets/production.env
  shared/agent-artifacts/
```

Stage a committed source archive in a new release directory, link its `.env.local` to the shared production file, prepare any required additive schema, then use the staged release's script:

```bash
bash /root/zhiyuan-job-assistant/releases/<release-id>/deploy/agent-runtime/release.sh \
  /root/zhiyuan-job-assistant /root/zhiyuan-job-assistant/releases/<release-id>
```

The script installs dependencies, builds both processes, backs up PostgreSQL, runs runtime preflight, pauses Worker claims for the switch, updates `current`, reloads PM2, and checks `/login`. It verifies schema but does not apply migrations. Confirm both processes, authenticated task execution, static resources, and the application version after deployment.

```bash
bash /root/zhiyuan-job-assistant/current/deploy/agent-runtime/rollback.sh \
  /root/zhiyuan-job-assistant /root/zhiyuan-job-assistant/releases/<previous-release>
```

Application rollback preserves the database and shared artifacts. See the [deployment runbook](deploy/agent-runtime/README.md) for the complete procedure and shared-environment contract.

## Database migration

SQLite remains a migration source and compatibility/archive path. Migrating historical data is separate from starting a new PostgreSQL database:

```bash
npm run migrate:postgres -- --dry-run --default-owner <user-id> --report reports/postgres-migration-dry-run.md
npm run migrate:postgres -- --apply --default-owner <user-id> --report reports/postgres-migration-apply.md
npm run check:postgres-migration -- --default-owner <user-id> --report reports/postgres-migration-verify.md
npm run check:postgres-cutover
```

Replace `<user-id>` with a real existing owner ID before running. Verify source and target and back up before applying. Memory-ledger migration has separate backup and governance requirements; follow [PostgreSQL migration](docs/POSTGRES_MIGRATION.md) and [memory release gates](docs/agent-system-specs/13-memory-migration-and-release-gates.md).

## Repository map

```text
src/app/                 Pages, auth, admin, and API routes
src/components/home/     Daily journal components
src/components/agent/    Conversation, approvals, journeys, and voice UI
src/components/design/   Shared design primitives
src/lib/agent/           Agents, tool policy, durable runtime, and projections
src/lib/memory/          Memory admission, retrieval, governance, and erasure
src/lib/server/          Server-side import, export, and voice services
src/lib/home-dashboard.ts Homepage prioritization and aggregation
src/worker/              Standalone Agent Worker entry
src/__tests__/           Unit, regression, and eval tests
public/art/              Homepage illustrations
scripts/                 Build, validation, migration, and operational scripts
deploy/                  Release/rollback and authentication infrastructure
docs/                    Architecture, runbooks, specifications, and research
openspec/                Change proposals and implementation plans
promptfoo/               Red-team configuration
modes/, templates/       Prompt modes and resume templates
```

## Further reading

- [Documentation index](docs/README.md), [architecture](docs/ARCHITECTURE.md), [setup](docs/SETUP.md), and [script reference](docs/SCRIPTS.md).
- [Tool governance](docs/AGENT_TOOL_GOVERNANCE.md), [Agent specs](docs/agent-system-specs/README.md), and [memory evals](docs/MEMORY_EVALS.md).
- [Homepage research](docs/research/today-journal-homepage-research-2026-10-07.md) and [homepage upgrade plan](docs/review/today-journal-homepage-upgrade-plan-2026-10-07.md).
- [Course system](docs/course-system/README.md) and [feature evals](docs/feature-system/evals/README.md).

## Acknowledgements and license

This project began as a fork of [career-ops](https://github.com/bengous/career-ops) by [Ben Gou](https://github.com/bengous). Zhiyuan extends that foundation into a multi-user web workspace with Chinese-market evaluations, conversational agents, durable execution, and governed memory. Third-party notices are in [NOTICE](NOTICE).

Licensed under [MIT](LICENSE). Resume, offer, voice, and other content used by AI features is sent to the configured providers; self-hosting controls application storage but does not make model requests offline. Review AI-generated claims before using them with employers. See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md).
