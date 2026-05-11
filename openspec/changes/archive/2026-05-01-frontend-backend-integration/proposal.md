## Why

Career-Ops 前端（Next.js 16）目前只有一个 `/api/evaluate` 路由接通了 DeepSeek 后端。其余 8 个模块页面依赖 mock 数据或纯本地逻辑——URL 模式不能真正抓取网页，CV PDF 是假下载，discover 页显示硬编码数据。前端 UI 已就绪，但后端能力完全脱节。需要在不大改架构的前提下，用最小 API 表面积把前后端实际接通。

## What Changes

- **Add `/api/fetch-jd`**: URL JD scraping endpoint — fetch + cheerio 抓取网页，返回纯文本 JD 内容
- **Add `/api/generate-cv-pdf`**: Real PDF generation via Playwright — 读取 `templates/cv-template.html`，填入用户数据，返回 A4 PDF
- **Add `/api/cv/analyze`**: AI-powered CV-JD matching analysis — DeepSeek 驱动的简历关键词匹配和改写建议
- **Add `/api/interview/questions`**: AI-generated role-specific interview questions — 替换硬编码问题库
- **Add `/api/scan/status`**: Read-only scan results API — 读取 CLI 扫描产物（pipeline.md, scan-history.tsv, portals.yml）
- **Add `/api/data/import`**: Full CLI data bridge — 读取 `data/applications.md`, `reports/*.md`, `config/profile.yml`，返回 JSON 供前端导入 IndexedDB
- **Update evaluate page**: URL 模式先调 fetch-jd 获取内容；加 zh/en 语言切换
- **Update cv page**: PDF 下载调 generate-cv-pdf；AI 分析调 cv/analyze
- **Update interview page**: 加"AI 生成问题"按钮，调 interview/questions
- **Update discover page**: 删 MOCK 数据，改调 scan/status
- **Update settings page**: 加"从 CLI 导入"按钮，调 data/import
- **Port followup-cadence & analyze-patterns**: 核心算法移植到前端 `lib/analytics.ts` 作为纯 TypeScript 函数
- **Port liveness-core**: 纯函数提取到 `lib/liveness.ts`
- **Zero breaking changes** to existing CLI scripts, modes files, or data formats

## Capabilities

### New Capabilities
- `jd-fetch-api`: URL-to-text JD scraping via fetch + cheerio, returns cleaned JD content
- `cv-pdf-api`: Playwright-based PDF generation using cv-template.html with user data injection
- `cv-analyze-api`: DeepSeek-powered CV-JD matching with keyword coverage and rewrite suggestions
- `interview-questions-api`: AI-generated role-specific interview questions across 4 categories
- `scan-status-api`: Read-only API surfacing CLI scan results from pipeline.md and scan-history.tsv
- `data-import-api`: CLI data bridge — reads applications.md, reports/*.md, profile.yml and returns JSON
- `frontend-analytics-lib`: Pure TypeScript port of followup-cadence and analyze-patterns algorithms
- `frontend-lib-liveness`: Pure TypeScript port of liveness-core classification functions

### Modified Capabilities
None — existing CLI system and frontend pages continue to work. All changes are additive API routes and page enhancements.

## Impact

- `frontend/src/app/api/` — 5 new route directories (fetch-jd, generate-cv-pdf, cv/analyze, interview/questions, scan/status, data/import)
- `frontend/src/app/evaluate/page.tsx` — URL mode now calls fetch-jd API + language toggle
- `frontend/src/app/cv/page.tsx` — real PDF download + AI analysis replacing mock logic
- `frontend/src/app/interview/page.tsx` — AI question generation replacing hardcoded bank
- `frontend/src/app/discover/page.tsx` — remove MOCK_SOURCES/MOCK_RESULTS, use scan/status API
- `frontend/src/app/settings/page.tsx` — CLI data import button + handler
- `frontend/src/lib/analytics.ts` — new file: ported followup-cadence + analyze-patterns algorithms
- `frontend/src/lib/liveness.ts` — new file: ported liveness-core pure functions
- `frontend/package.json` — add cheerio, playwright dependencies
- No changes to CLI `.mjs` scripts, `modes/` files, or data formats
