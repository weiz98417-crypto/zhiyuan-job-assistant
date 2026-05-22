# 筝筝纸鸢 (Zhiyuan) — AI Job Search Assistant

<p align="center">
  <img src="https://img.shields.io/badge/DeepSeek_V4-4B6BFB?style=flat&logo=deepseek&logoColor=white" alt="DeepSeek V4">
  <img src="https://img.shields.io/badge/Next.js_16-000?style=flat&logo=next.js&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

AI-powered job search assistant for the Chinese market. Evaluate JDs, optimize resumes, prepare interviews, compare offers — all through a conversational agent interface.

> **Not a mass-application tool.** Zhiyuan is a filter — it finds the few opportunities worth your time.

---

## Features

### Conversational Agent (纸鸢 Agent)
- **6 specialized sub-agents**: Resume, Evaluate, Interview, Profile, Offer, General — auto-routed by regex intent classification with priority ordering
- **Native function calling**: 41 tools across query (16), action (18), interview (2), MCP (5)
- **ToolResult triple-pipe architecture**: `llmSummary` (LLM context), `uiPayload` (React components), `rawData` (storage) — fully decoupled
- **Stream Delegation pattern**: Long-running tools return ReadableStream for real-time progress events
- **True streaming LLM responses**: Text chunks yield as they arrive — no buffering. `isLastAssistant` fix keeps streaming text visible during tool execution
- **Minimal tool result cards**: Data-query tools show compact indicators ("已读取文件", "已完成搜索") — no raw text dumping
- **Error self-healing**: `errorCategory` (ok/transient/permanent/need_user_input) + `forceTextOnly` code-level guard — permanent errors block subsequent tool calls
- **Context budget**: `MAX_CONTEXT_TOKENS=64000`, `DEFAULT_TOOL_CTX_CAP=800` — tuned for DeepSeek V4 128K window
- **Multi-model fallback chain**: DeepSeek V4 Flash → Pro → Zhipu GLM → Qwen — auto-degrades on 429/503
- **Server-side agent loop**: Direct API key management, no client-side key exposure
- **Agent.md loading**: Agent souls defined in Markdown files, loaded via `loadAgentMD()` — clean separation of prompts and code

### JD Evaluation (职位评估)
- **A-G 7-dimension real-time streaming**: OCR → Archetype detection → Blocks A-G evaluated one-by-one via SSE, with live progress (`A·概览 ✓4.2 · B·匹配 ⏳`)
- **Auto CV matching**: Block B automatically fetches saved CV from SQLite for precise skill/experience matching
- **3-layer risk scanning**: Regex patterns + blacklist dictionary (30 terms) + scam pattern detection; risk signals injected into Block G evaluation
- **Risk signal highlighting**: Color-coded severity badges (🔴 critical / 🟠 high / 🟡 medium) in output
- **Score extraction defense**: Bounds-checked regex (1-5 range) prevents false scores like "256/5"
- **Smart no-data scoring**: Missing salary/legitimacy info → 1 point (not default 3)
- **Auto-persist**: Report + JD saved to SQLite and Dexie simultaneously after evaluation completes
- **Decode black market terms**: "弹性工作制" → "上班固定下班弹性，越弹越晚，无加班费"
- **China-specific**: 五险一金, 税前/税后, 竞业限制, 外包/本部, 试用期陷阱, 公积金

### Resume Optimization (简历优化)
- **Section-by-section optimization**: Summary, Experience, Projects, Education, Skills
- **Reference resume library**: Upload + AI-parse (DeepSeek Flash, 16K tokens, project extraction from experience). Reference matching gated behind Effort ≥ 4
- **6-step thinking framework**: AI extracts reference resume structure (background→design→mechanism→feedback→team→metrics) and applies same depth to user's domain
- **4 operation modes**: Full, Polish, Expand, Quantify — 5 effort levels each. `enablePlaceholders` globally controls [XX] across all prompt functions
- **Role-specific templates**: PM, AI PM, Backend, Frontend, Data/AI, QA, Design, Operations
- **Save confirmation gate**: Agent MUST ask before writing — no auto-save
- **ATS compatibility check**: JD-specific keyword coverage analysis
- **PDF export**: Playwright-based HTML → PDF with custom templates
- **Agent.md loaded**: Resume agent soul in Markdown, loaded via `loadAgentMD("resume")`

### Application Tracker (投递追踪)
- Full pipeline: Evaluated → Applied → Screened → Interview → Offer → Accepted/Rejected
- SQLite persistence with canonical status states
- Interview round tracking with dates and notes

### Offer Comparison (Offer 对比)
- Multi-dimensional weighted comparison (salary, equity, growth, culture, WLB, stability)
- China-specific: 五险一金, 13薪/14薪, 公积金比例, 试用期
- Tax-adjusted real income calculation

### Interview Preparation (面试准备)
- **4 workflows**: 普通出题 (read resume→generate), JD专项 (search JD→read resume→targeted), 面经搜索 (web_search→generate), 项目深挖 (read specific project→deep dive)
- AI-generated role-specific questions from JD + career profile
- Company/industry research via `web_search` for real interview experiences
- Interactive mock interview sessions with scoring
- Agent.md loaded: Interview coach soul in Markdown, four workflows defined cleanly

### Job Discovery (职位发现)
- **30+ enterprise career site scanner**: Auto-scans company recruitment portals (not BOSS/51job) from Beijing, Shanghai, Shenzhen, Hangzhou, Guangzhou
- **Dual-channel architecture**: Public API (Greenhouse/Lever, zero cost) + Playwright browser (Moka/Beisen/custom pages)
- **LLM-powered extraction**: Claude Haiku extracts structured job data from arbitrary career pages (15 custom companies)
- **Real-time scan UI**: Trigger scans from `/discover`, live progress with per-company status chips, inline evaluation slide-over panel
- **Background worker**: `scan-worker.mjs` daemon with CAS task claiming, crash recovery, graceful shutdown, circuit breaker
- **SQLite persistence**: `scan_queue` + `scan_jobs` tables with URL dedup, title filtering, per-user isolation
- **title_filter**: Configurable positive/negative keyword filtering applied at extraction time
- **5 adapters**: Greenhouse, Lever, Moka (12 companies), Beisen (5 companies), Custom/LLM (15 companies)

### Analytics (数据分析)
- Application pipeline health dashboard
- Weekly activity reports
- Pattern analysis for rejection trends

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (Turbopack), React 19, TypeScript |
| **Styling** | Tailwind CSS 4, Framer Motion, CSS custom properties |
| **AI Models** | DeepSeek V4 (primary), Zhipu GLM-4, Qwen-Long (fallbacks) |
| **Database** | SQLite via better-sqlite3 (canonical), Dexie/IndexedDB (client cache), localStorage (CV) |
| **PDF** | Playwright + HTML/CSS templates |
| **Agent Runtime** | Custom ReAct loop with native function calling |

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure API keys (at least one)
cp .env.example .env.local
# Edit .env.local:
#   DEEPSEEK_API_KEY=sk-xxx       (required)
#   ZHIPU_API_KEY=xxx             (optional fallback)
#   DASHSCOPE_API_KEY=xxx         (optional fallback)

# 3. Onboarding check
node scripts/check-onboarding.mjs

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Production build
npm run build && npm start
```

---

## Project Structure

```
├── src/
│   ├── app/                  # 11 pages + 50+ API routes
│   │   ├── agent/            # Conversational agent (home) — AgentChat + SessionList
│   │   ├── cv/               # Resume editor + optimizer
│   │   ├── evaluate/         # JD evaluation + JD library + report library
│   │   ├── tracker/          # Application pipeline
│   │   ├── interview/        # Interview prep + mock sessions
│   │   ├── compare/          # Offer comparison
│   │   ├── discover/         # Job portal scanner
│   │   ├── explore/          # Free-form AI chat
│   │   ├── profile/          # Career profile / DNA
│   │   ├── settings/         # User preferences + data import/export
│   │   ├── analytics/        # Data dashboard
│   │   └── api/              # REST + SSE endpoints (50+ routes)
│   ├── components/
│   │   ├── agent/            # AgentChat, SessionList, SuggestionChips
│   │   ├── design/           # Shared design system components
│   │   └── ocr/              # Screenshot OCR input
│   └── lib/
│       ├── agent/            # Agent system
│       │   ├── loop/         # client-runner + server-runner
│       │   ├── registry/     # 6 sub-agents + agent.md souls
│       │   ├── tools/        # 18 action + 13 query + 2 interview + 5 MCP tools
│       │   ├── memory/       # Layered memory (working/episodic/semantic)
│       │   ├── orchestrator/ # Intent routing + tool dispatch
│       │   └── interview/    # Interview simulation engine
│       ├── db.ts             # SQLite client
│       ├── cv-storage.ts     # CV data layer
│       ├── judge-engine.ts   # Resume optimization prompts
│       └── jd-storage.ts     # JD persistence
├── scripts/                  # Node.js utilities (*.mjs)
│   ├── scan-risks.mjs        # 3-layer risk signal detection
│   ├── check-onboarding.mjs  # First-run setup validation
│   ├── db-write.mjs          # SQLite data writer
│   └── validate-output.mjs   # Output validation
├── modes/                    # AI prompt modes
│   └── zh/                   # China-specific: jianzhi, risk-intel, etc.
├── templates/                # CV HTML/PDF templates
├── risk-intel-triggers.yml   # 31 regex risk detection patterns
├── data/                     # SQLite database (gitignored)
├── reports/                  # Evaluation reports
└── openspec/                 # Design documents + change proposals
```

---

## Agent Tools (41 total)

### Query (read-only, 16 tools)
`search_applications` `get_report_detail` `get_reference_detail` `read_file`
`get_profile` `get_recent_activity` `get_recommendations` `get_pipeline_status`
`decode_black_market_terms` `check_pipeline_health` `get_profile_insights`
`detect_skill_gaps` `check_ats_compatibility` `generate_interview_questions`
`score_interview_answer` `check_ats_compatibility`

### Action (write-capable, 18 tools)
`evaluate_jd_full` `analyze_jd_risks` `optimize_resume_section` `save_resume_section`
`generate_cv` `import_resume` `compare_offers_deep` `prepare_interview_full`
`self_positioning` `start_interview_session` `scan_portals` `fetch_jd_content`
`evaluate_offer` `export_file` `mine_profile` `check_health`
`download_report_pdf` `evaluate_jd`

### MCP Shims (5 tools)
`web_search` `get_weather` `search_place` `get_directions` `search_jobs`

**Key parameters across all tools**: `offset`/`limit` (cursor-based reading), `section` (targeted reading), `role`/`date_from`/`score_min` (filtering), `timeout`/`retry` (resilience), `focus`/`difficulty` (precision control)

---

## Risk Detection Pipeline

```
JD Text → scan-risks.mjs
  ├─ Layer 1: Regex patterns (31 triggers) — catches common phrasings
  ├─ Layer 2: Dictionary substring (30 blacklist terms) — catches direct usage
  └─ Layer 3: Pattern detection (10 scam patterns) — 2+ signals → alert

Output → evaluate-jd-full tool → LLM synthesizes with colored risk badges
```

---

## Acknowledgement

This project began as a fork of **[career-ops](https://github.com/bengous/career-ops)** by [Ben Gou's](https://github.com/bengous). The original laid the foundation: CLI pipeline automation, multi-mode evaluation agents, and the philosophy of "AI should help candidates choose companies."

We extended: interactive frontend, conversational agent with 41 tools across 6 specialized sub-agents, ToolResult triple-pipe architecture, 3-layer risk scanning, China-specific localization, resume optimization judge engine with 6-step thinking framework, interview coach with 4 workflows, SQLite canonical persistence, and 50+ API endpoints.

---

## Disclaimer

- **Local-first.** Your data (resume, contacts, profile) stays on your device and goes directly to your AI provider.
- **AI outputs need human review.** Always verify before submission.
- **No warranties.** Evaluation scores are suggestions, not guarantees.
- Licensed under [MIT License](LICENSE).
