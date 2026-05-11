## Context

Career-ops has a layered architecture where `modes/` files define AI agent behavior. The system already supports multiple languages (DE/FR/JA/PT/RU) via separate mode directories, each with country-specific vocabulary and market conventions. Chinese localization follows this established pattern — no architectural changes needed, purely additive file creation.

**Current state:**
- `modes/_shared.md` — scoring engine (A-F + G), archetype detection (6 AI/ML roles), global rules
- `modes/_profile.template.md` — user profile with target roles, narrative, negotiation scripts
- `modes/oferta.md` — 7-block evaluation workflow (Spanish)
- `modes/auto-pipeline.md` — full pipeline trigger (English)
- No Chinese language support exists

**Constraints:**
- DATA_CONTRACT.md: User layer files (`_profile.md`, `profile.yml`, `cv.md`) must NOT be auto-updated
- All additions must be placed in `modes/zh/` to follow existing language mode pattern
- Zero breaking changes to existing code
- Must follow existing scoring architecture (A-G blocks) — adapt content, not structure

## Goals / Non-Goals

**Goals:**
- Provide a complete Chinese evaluation engine (modes/zh/_shared.md) with market-appropriate scoring, archetypes, and red flags
- Provide a Chinese user profile template (modes/zh/_profile.md) targeting AI non-technical roles
- Provide a Chinese evaluation workflow (modes/zh/jianzhi.md) producing A-G reports in Simplified Chinese
- Add Chinese status aliases to states.yml
- Add language auto-detection guidance in CLAUDE.md
- Provide auxiliary modes for auto-pipeline, batch pipeline, and PDF generation in Phase 2
- Support Chinese-specific compensation structure (税前/税后, 五险一金, 13薪/14薪, 公积金)

**Non-Goals:**
- Chinese job platform scraping (Boss直聘, 拉勾, etc.) — manual paste pipeline only
- Chinese CV template overhaul — reuse existing HTML/LaTeX templates with Chinese font support only
- Dashboard localization — lower priority, separate future change
- Translation of existing DE/FR/JA modes — Chinese builds independently
- WeChat/Mini-program integration

## Decisions

### Decision 1: Follow existing language mode pattern (modes/zh/ directory)

**Why:** The project already has `modes/de/`, `modes/fr/`, `modes/ja/`, `modes/pt/`, `modes/ru/` directories. Each contains a `_shared.md` plus core mode files. Adding `modes/zh/` is the proven pattern. No new infrastructure needed.

**Alternatives considered:**
- Modifying existing English modes in-place → rejected: would break existing users, violates DATA_CONTRACT.md
- Separate repo for Chinese fork → rejected: harder to sync upstream improvements

### Decision 2: Chinese mode file naming

- `_shared.md` — keep same name (already universal convention across all language dirs)
- `_profile.md` — keep same name
- `jianzhi.md` (兼职) — Chinese pinyin, following the pattern of `oferta.md` (Spanish), `angebot.md` (German), `offre.md` (French), `kyujin.md` (Japanese)
- `auto-pipeline.md`, `pipeline.md`, `pdf.md` — keep English names (these are referenced by CLAUDE.md routing)

### Decision 3: Six Chinese AI non-technical archetypes

| Archetype (Chinese) | Archetype (EN) | Key difference from existing |
|---------------------|----------------|------------------------------|
| AI产品经理 | AI Product Manager | Replaces "Technical AI PM" — broader, includes non-coding PMs |
| AI运营 | AI Operations | Entirely new — no Western equivalent. Growth, content, community ops with AI tools |
| AI解决方案 | AI Solutions Expert | Broader than "Solutions Architect" — includes pre-sales, POC, bidding |
| AI项目经理 | AI Project Manager | New — delivery-focused, agile management of AI projects |
| AI咨询顾问 | AI Consultant | Broader than "Transformation Lead" — strategy + execution |
| AI增长/市场 | AI Growth/Marketing | New — SEO, content, performance marketing with AI tools |

**Why 6 archetypes:** The existing system has 6. Keeping the same count makes scoring math consistent. Each has distinct JD signals and proof point mappings.

### Decision 4: Compensation framework adaptation

Replace the Western salary research sources with Chinese equivalents:

| Aspect | Western | Chinese |
|--------|---------|---------|
| Salary sources | Glassdoor, Levels.fyi, Blind | 脉脉, 看准网, Boss直聘薪资查询, OfferShow |
| Salary structure | Base + Bonus + Equity (USD) | 税前月薪 × N薪 + 年终奖 + 五险一金基数 (RMB) |
| Social benefits | 401k match, health insurance | 五险一金, 公积金比例, 补充医疗保险 |
| Red flags | No equity, no remote | 五险一金最低基数, 996, 竞业限制范围过大 |

### Decision 5: Red flag system for Chinese market

New red flags specific to Chinese job market:
- 工时: JD中明确996/大小周/高强度 — 扣分
- 五险一金: 按最低基数缴纳 — 扣分（标注显性薪酬 vs 实际成本）
- 竞业限制: 范围过大或补偿过低 — 警告
- 试用期: 超过法定6个月或试用期无五险一金 — 警告
- 公积金: 比例低于市场标准 — 标注
- 年终奖: 表述模糊（"视经营情况"）— 标注不确定性
- 劳动合同: 未明确签约方式（外包/本部/劳务派遣）— 警告

### Decision 6: Block G — Posting Legitimacy for Chinese platforms

Chinese platforms have different ghost posting signals:
- JD描述过于笼统（"AI相关"但无具体技术栈）
- 公司规模与JD岗位不符（小公司招AI大模型专家，预算明显不够）
- 薪资范围过宽（15k-40k）且JD模糊
- 招聘平台公司主页无活跃动态
- 同一岗位长期挂在多个平台
- 公司近期有裁员或劳动仲裁记录

## Risks / Trade-offs

- **Risk:** Market evolves faster than archetypes → **Mitigation:** _profile.md is user-editable, archetypes are recommendations not hard rules
- **Risk:** Chinese salary data less transparent than US → **Mitigation:** Block D notes uncertainty, uses ranges, cites sources
- **Risk:** Maintaining two language modes doubles content work → **Mitigation:** Shared scoring structure (A-G), only content differs; Phase 1 is 3 core files
- **Risk:** Simplified vs Traditional Chinese → **Mitigation:** Default to Simplified; if Taiwan/HK market demand arises, add `modes/zh-tw/` following same pattern
