# 筝筝纸鸢 (Zhiyuan) — AI Job Search Assistant

> **Acknowledgement**: This project is based on the open-source project [career-ops](https://github.com/bengous/career-ops). We have carried out extensive localization for the Chinese job market and significant feature enhancements including an interactive frontend dashboard, AI resume optimization judge engine, agent-based multi-agent architecture, and role-specific writing guides. We are grateful to the original author for making career-ops open source.

<p align="center">
  <img src="https://img.shields.io/badge/DeepSeek_V4_Pro-4B6BFB?style=flat&logo=deepseek&logoColor=white" alt="DeepSeek V4 Pro">
  <img src="https://img.shields.io/badge/Next.js_16-000?style=flat&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

[简体中文](README.cn.md)

---

## What Is This

**Zhiyuan** (筝筝纸鸢) is an AI-powered job search assistant built for the Chinese market. It helps you:

- **Evaluate job postings** with a structured multi-dimensional scoring system tailored to Chinese hiring practices
- **Optimize your resume** with an AI judge engine that rewrites each section using role-specific templates (PM, Backend, Frontend, AI/Data, QA, Design, Operations)
- **Prepare for interviews** with AI-generated questions based on JD analysis
- **Track applications** end-to-end from evaluation to offer
- **Compare offers** with China-specific metrics (五险一金, 税前/税后, 13薪/14薪, 公积金, 试用期)
- **Discover opportunities** by scanning job portals

> **Not a mass-application tool.** Zhiyuan is a filter — it helps you identify the few opportunities worth your time.

## Features

### Interactive Frontend Dashboard
A full Next.js web application with 11 pages: Agent Chat, CV Optimization, JD Evaluation, Application Tracker, Interview Prep, Offer Comparison, Job Discovery, Analytics, Profile, Settings, and Explore.

### AI Resume Optimization (Judge Engine)
- **4-dimension priority model**: Operation × Effort × JD Filter × Reference Style
- **4 optimization modes**: Full optimization, STAR restructuring, Quantification enhancement, Keyword injection
- **5 effort levels**: From light polish to full rewrite, each with perceivable output differences
- **XX placeholder mechanism**: AI infers quantifiable dimensions and marks them with `[XX]` placeholders — you fill in the real numbers
- **Interactive Q&A mode** (Effort 4-5): AI asks you clarifying questions before generating, enriching the output with your actual data
- **8 role-specific writing templates**: PM, AI PM, Backend, Frontend, Data/AI, QA, Design, Operations — auto-detected from your career profile
- **JD-paired optimization**: Target a specific JD and AI prioritizes relevant keywords and skills

### Agent Architecture
- **5 specialized sub-agents**: Resume, Evaluate, Interview, Profile, General
- **Intent-based routing**: Natural language input is automatically routed to the right agent
- **Knowledge injection**: Each agent receives scenario-specific knowledge (salary benchmarks, company interview styles, JD signals, role writing guides)

### JD Evaluation
- Multi-dimensional scoring (Role Match, CV Fit, Level Assessment, Salary, Customization, Interview Prep)
- JD signal detection (overtime culture, stability, compensation hints)
- One-click evaluation from URL paste or text
- Evaluation report history with search and filtering

### Application Tracker
- Full pipeline status management (Evaluated → Applied → Responded → Interview → Offer)
- Interview round tracking with dates and notes
- Report-to-application linking

### Offer Comparison
- China-specific compensation breakdown (monthly salary, months/year, bonus, social insurance, housing fund, probation)
- Side-by-side comparison of multiple offers

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion |
| **AI Model** | DeepSeek V4 Pro (chat), DeepSeek V4 Flash (lighter tasks) |
| **Database** | SQLite (better-sqlite3) for server-side persistence |
| **PDF** | Playwright + HTML templates |
| **Agent Runtime** | Claude Code CLI with custom agent loop |

## Quick Start

```bash
# 1. Install dependencies
cd frontend && npm install

# 2. Configure API key
cp .env.example .env.local
# Edit .env.local and set DEEPSEEK_API_KEY

# 3. Start development server
npm run dev

# 4. Open http://localhost:3000
```

## Project Structure

```
├── frontend/                    # Next.js 前端应用
│   ├── src/
│   │   ├── app/
│   │   │   ├── agent/           # Agent 对话页
│   │   │   ├── cv/              # 简历优化 + 编辑页
│   │   │   ├── evaluate/        # JD 评估页
│   │   │   ├── tracker/         # 投递追踪页
│   │   │   ├── interview/       # 面试准备页
│   │   │   ├── compare/         # Offer 对比页
│   │   │   ├── discover/        # 职位发现页
│   │   │   ├── explore/         # 探索对话页
│   │   │   ├── profile/         # 求职画像页
│   │   │   ├── settings/        # 个人设置页
│   │   │   ├── analytics/       # 数据分析页
│   │   │   └── api/             # 40+ API 路由
│   │   ├── components/          # 共享 UI 组件
│   │   └── lib/                 # 核心库
│   │       ├── agent/           # Agent 系统
│   │       ├── judge-engine.ts  # 简历优化 Prompt 流水线
│   │       └── server-db.ts     # SQLite 数据层
├── modes/                       # AI 提示词模式
├── config/                      # 用户配置文件
├── templates/                   # CV HTML 模板
├── scripts/                     # 批处理与验证脚本 (*.mjs)
├── dashboard/                   # Go 终端看板
├── data/                        # 应用数据 (SQLite)
├── reports/                     # 评估报告
└── openspec/                    # 设计文档
```

## Disclaimer

Zhiyuan is a local, open-source tool — not a hosted service.

- **Your data stays on your device.** Resume, contacts, and personal data are stored locally and sent directly to your chosen AI provider (DeepSeek).
- **AI outputs need human review.** Always verify AI-generated content before submission.
- **No warranties.** Evaluation scores are suggestions, not guarantees. See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md).
- Licensed under [MIT License](LICENSE).
