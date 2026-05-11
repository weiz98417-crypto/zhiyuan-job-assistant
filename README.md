# 筝筝纸鸢 (Zhiyuan) — AI Job Search Assistant

<p align="center">
  <img src="https://img.shields.io/badge/DeepSeek_V4-4B6BFB?style=flat&logo=deepseek&logoColor=white" alt="DeepSeek V4">
  <img src="https://img.shields.io/badge/Next.js_16-000?style=flat&logo=next.js&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

AI-powered job search assistant for the Chinese market. Evaluate JDs, optimize resumes, prepare interviews, compare offers — all through a conversational agent interface.

> **Not a mass-application tool.** Zhiyuan is a filter — it finds the few opportunities worth your time.

---

## Features

### Conversational Agent (纸鸢 Agent)
- **5 specialized sub-agents**: Resume, Evaluate, Interview, Profile, General — auto-routed by intent
- **Native function calling**: 27 tools across query (read) and action (write) categories
- **Quality-gated ReAct loop**: Self-healing with retry/degrade on tool failures, dedup for repeat calls
- **Multi-model fallback chain**: DeepSeek V4 → Zhipu GLM → Qwen — auto-degrades on 429/503
- **Server-side agent loop**: Direct API key management, no client-side key exposure
- **Claude Code-style status bar**: Real-time phase indicator with elapsed timer (`🧠 识别中 ⏱ 3s`)

### JD Evaluation (职位评估)
- **A-G 7-dimension scoring**: Overview, CV Match, Level & Strategy, Salary & Market, Customization, Interview Prep, Legitimacy
- **3-layer risk scanning**: Regex patterns + blacklist dictionary (30 terms) + scam pattern detection
- **Risk signal highlighting**: Color-coded severity badges (🔴 critical / 🟠 high / 🟡 medium) in output
- **Decode black market terms**: "弹性工作制" → "上班固定下班弹性，越弹越晚，无加班费"
- **China-specific**: 五险一金, 税前/税后, 竞业限制, 外包/本部, 试用期陷阱, 公积金

### Resume Optimization (简历优化)
- **Section-by-section optimization**: Summary, Experience, Projects, Education, Skills
- **4 operation modes**: Full, Polish, Expand, Quantify — 5 effort levels each
- **Role-specific templates**: PM, AI PM, Backend, Frontend, Data/AI, QA, Design, Operations
- **Save confirmation gate**: Agent MUST ask before writing — no auto-save
- **ATS compatibility check**: Keyword density, format scanning
- **PDF export**: Playwright-based HTML → PDF with custom templates

### Application Tracker (投递追踪)
- Full pipeline: Evaluated → Applied → Screened → Interview → Offer → Accepted/Rejected
- SQLite persistence with canonical status states
- Interview round tracking with dates and notes

### Offer Comparison (Offer 对比)
- Multi-dimensional weighted comparison (salary, equity, growth, culture, WLB, stability)
- China-specific: 五险一金, 13薪/14薪, 公积金比例, 试用期
- Tax-adjusted real income calculation

### Interview Preparation (面试准备)
- AI-generated role-specific questions from JD + career profile
- STAR+R story bank with accumulated experience across evaluations
- Company-specific interview intel (style, common questions, culture)
- Interactive mock interview sessions

### Job Discovery (职位发现)
- Configurable portal scanner with dedup history
- Multi-keyword, multi-company search
- JD liveness checker (is the posting still active?)

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
| **Database** | SQLite via better-sqlite3 (canonical), localStorage (cache) |
| **PDF** | Playwright + HTML/CSS templates |
| **Agent Runtime** | Custom ReAct loop with native function calling |

---

## Quick Start

```bash
# 1. Install
cd frontend && npm install

# 2. Configure API keys (at least one)
cp .env.example .env.local
# Edit .env.local:
#   DEEPSEEK_API_KEY=sk-xxx       (required)
#   ZHIPU_API_KEY=xxx             (optional fallback)
#   DASHSCOPE_API_KEY=xxx         (optional fallback)

# 3. Onboarding check
node scripts/check-onboarding.mjs

# 4. Start
npm run dev
# → http://localhost:3000
```

---

## Project Structure

```
├── frontend/                     # Next.js 16 web app
│   └── src/
│       ├── app/                  # 11 pages + 50+ API routes
│       │   ├── agent/            # Conversational agent (home)
│       │   ├── cv/               # Resume editor + optimizer
│       │   ├── evaluate/         # JD evaluation
│       │   ├── tracker/          # Application pipeline
│       │   ├── interview/        # Interview prep
│       │   ├── compare/          # Offer comparison
│       │   ├── discover/         # Job portal scanner
│       │   ├── explore/          # Legacy chat (migrated to agent)
│       │   ├── profile/          # Career profile / DNA
│       │   ├── settings/         # User preferences
│       │   ├── analytics/        # Data dashboard
│       │   └── api/              # REST + SSE endpoints
│       ├── components/
│       │   ├── agent/            # AgentChat, SessionList, SuggestionChips
│       │   ├── design/           # Shared design system components
│       │   └── ocr/              # Screenshot OCR input
│       └── lib/
│           ├── agent/            # Agent system
│           │   ├── loop/         # client-runner + server-runner
│           │   ├── registry/     # 5 sub-agents + tool registry
│           │   ├── tools/        # 16 action + 11 query tools
│           │   ├── memory/       # Layered memory (working/episodic/semantic)
│           │   ├── orchestrator/ # Intent routing + tool dispatch
│           │   └── interview/    # Interview simulation engine
│           ├── db.ts             # SQLite client
│           ├── cv-storage.ts     # CV data layer
│           ├── judge-engine.ts   # Resume optimization prompts
│           └── jd-storage.ts     # JD persistence
├── scripts/                      # Node.js utilities (*.mjs)
│   ├── scan-risks.mjs            # 3-layer risk signal detection
│   ├── check-onboarding.mjs      # First-run setup validation
│   ├── db-write.mjs              # SQLite data writer
│   └── validate-output.mjs       # Output validation
├── modes/                        # AI prompt modes
│   └── zh/                       # China-specific: jianzhi, risk-intel, etc.
├── templates/                    # CV HTML/PDF templates
├── risk-intel-triggers.yml       # 31 regex risk detection patterns
├── data/                         # SQLite database (gitignored)
├── reports/                      # Evaluation reports
└── openspec/                     # Design documents + change proposals
```

---

## Agent Tools (27 total)

### Query (read-only)
`get_profile` `get_recent_activity` `get_pipeline_status` `search_applications`
`get_recommendations` `get_report_detail` `get_profile_insights` `detect_skill_gaps`
`check_pipeline_health` `decode_black_market_terms` `check_ats_compatibility`

### Action (write-capable)
`evaluate_jd_full` `analyze_jd_risks` `optimize_resume_section` `save_resume_section`
`generate_cv` `import_resume` `compare_offers_deep` `prepare_interview_full`
`self_positioning` `start_interview_session` `scan_portals` `fetch_jd_content`
`evaluate_offer` `export_file` `mine_profile` `check_health`

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

We added: interactive frontend, conversational agent with 27 tools, 3-layer risk scanning, China-specific localization, resume optimization judge engine, SQLite persistence, and 50+ API endpoints.

---

## Disclaimer

- **Local-first.** Your data (resume, contacts, profile) stays on your device and goes directly to your AI provider.
- **AI outputs need human review.** Always verify before submission.
- **No warranties.** Evaluation scores are suggestions, not guarantees.
- Licensed under [MIT License](LICENSE).
