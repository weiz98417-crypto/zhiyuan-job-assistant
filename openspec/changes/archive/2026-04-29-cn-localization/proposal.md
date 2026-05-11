## Why

Career-ops is a proven AI-powered job search pipeline, but it was built for Western markets — it speaks English and assumes Greenhouse/Ashby/Lever, US-based compensation frameworks, and AI/ML engineering archetypes. The Chinese job market has fundamentally different platforms (Boss直聘, 拉勾, 猎聘), cultural norms (简历格式, 五险一金, 税前/税后), role taxonomies (AI产品经理, AI运营), and evaluation criteria (996, 竞业限制, 试用期). This change adapts the evaluation core for Chinese job seekers while keeping the proven A-G scoring architecture intact.

## What Changes

- **Add `modes/zh/` directory** with Chinese-language mode files:
  - `_shared.md` — scoring engine adapted for Chinese market (RMB salary structure, 五险一金, 996 red flags, Chinese resume norms, 脉脉/看准网 salary sources)
  - `_profile.md` — user archetype template with Chinese AI non-technical roles (AI产品经理, AI运营, AI解决方案, AI项目经理, AI咨询顾问, AI增长/市场)
  - `jianzhi.md` — core evaluation workflow, A-G 7-block assessment report in Chinese
- **Add Phase 2 auxiliary modes**: `auto-pipeline.md`, `pipeline.md`, `pdf.md` in simplified Chinese
- **Add Phase 3 infrastructure**: Chinese status aliases in `states.yml`, Chinese profile example in `config/profile.example.zh.yml`, language detection guidance in `CLAUDE.md`
- **Zero breaking changes** to existing code — all additions in new `modes/zh/` directory and optional config files

## Capabilities

### New Capabilities
- `zh-evaluation-engine`: Chinese scoring engine, archetypes, and core evaluation workflow — replaces English _shared.md + _profile.md + oferta.md equivalents for Chinese market
- `zh-auxiliary-modes`: Chinese auto-pipeline, pipeline batch processing, and PDF/CV generation modes
- `zh-infrastructure`: Chinese status aliases, profile config template, and CLAUDE language detection support

### Modified Capabilities
<!-- No existing capabilities are modified — only additions -->

## Impact

- `modes/zh/` — 8 new mode files (3 core + 3 auxiliary + template)
- `templates/states.yml` — add Chinese aliases to existing canonical states
- `config/profile.example.zh.yml` — new Chinese-specific profile example
- `CLAUDE.md` — add language mode detection guidance for Chinese JDs
- `openspec/specs/` — new spec files for each capability
