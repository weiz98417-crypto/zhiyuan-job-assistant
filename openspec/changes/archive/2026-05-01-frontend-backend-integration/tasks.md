## 1. Dependencies & Setup

- [x] 1.1 Install `cheerio` in frontend/package.json
- [x] 1.2 Verify `playwright` is in frontend devDependencies
- [x] 1.3 Verify backend templates/cv-template.html and fonts/ are accessible

## 2. Phase 1: Fix Broken Core Flows

- [x] 2.1 Create `/api/fetch-jd` route (POST) — fetch + cheerio JD scraping, platform detection, HTML sanitization, 10s timeout
- [x] 2.2 Update evaluate page — URL mode calls /api/fetch-jd first, then passes fetched text to /api/evaluate; add error state for unreachable URLs
- [x] 2.3 Create `/api/generate-cv-pdf` route (POST) — Playwright PDF generation, load cv-template.html, replace placeholders, return application/pdf
- [x] 2.4 Update cv page downloadPDF — call /api/generate-cv-pdf, handle loading state, trigger browser download of returned blob

## 3. Phase 2: AI-Powered Smart Features

- [x] 3.1 Create `/api/cv/analyze` route (POST) — DeepSeek CV-JD matching, keyword coverage analysis, rewrite suggestions, per-section feedback
- [x] 3.2 Update cv page analyzeJD — call /api/cv/analyze instead of local string.includes, render AI results
- [x] 3.3 Create `/api/interview/questions` route (POST) — DeepSeek role-specific question generation across 4 categories with story hints
- [x] 3.4 Update interview page — add "AI 生成问题" button that calls /api/interview/questions, keep hardcoded questions as fallback
- [x] 3.5 Add language toggle (zh/en) to evaluate page — pass language param to /api/evaluate API
- [x] 3.6 Update /api/evaluate route — load English modes (modes/_shared.md, modes/apply.md) when language=en

## 4. Phase 3: CLI Bridge

- [x] 4.1 Create `/api/scan/status` route (GET) — read portals.yml, data/pipeline.md, data/scan-history.tsv, cross-reference applications.md
- [x] 4.2 Update discover page — replace MOCK_SOURCES/MOCK_RESULTS/MOCK_HISTORY with /api/scan/status data; update Scan Now button to show CLI instructions
- [x] 4.3 Create `/api/data/import` route (GET) — read data/applications.md, reports/*.md, config/profile.yml, return structured JSON
- [x] 4.4 Update settings page — add "从 CLI 导入" button calling /api/data/import, bulk insert into IndexedDB with dedup

## 5. Frontend Utility Libraries

- [x] 5.1 Create `frontend/src/lib/analytics.ts` — port followup-cadence.mjs algorithm (follow-up urgency tiers) and analyze-patterns.mjs (funnel/rejection analysis)
- [x] 5.2 Create `frontend/src/lib/liveness.ts` — port liveness-core.mjs pure classification functions
- [x] 5.3 Update analytics page — use lib/analytics.ts functions instead of local simplified logic

## 6. Verification

- [ ] 6.1 Manual test: evaluate page URL mode with real job posting link
- [ ] 6.2 Manual test: CV PDF download produces formatted A4 PDF
- [ ] 6.3 Manual test: CV AI analysis returns meaningful match data
- [ ] 6.4 Manual test: Interview AI questions are role-specific
- [ ] 6.5 Manual test: Discover page shows real data (when scan output exists)
- [ ] 6.6 Manual test: Settings CLI import populates IndexedDB
- [ ] 6.7 Verify no regression: tracker, compare, home pages still function
