# 筝筝纸鸢 — AI 求职助手

## Data Contract (CRITICAL)

There are two layers. Read `DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

**System Layer (DON'T put user data here):**
- `modes/_shared.md`, `modes/oferta.md`, all other modes
- `CLAUDE.md`, `*.mjs` scripts, `templates/*`, `batch/*`

**THE RULE: When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.**

## What is 筝筝纸鸢

AI-powered job search automation for the Chinese market: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

### Main Files

| File | Function |
|------|----------|
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `generate-pdf.mjs` | Playwright: HTML to PDF |
| `article-digest.md` | Compact proof points from portfolio (optional) |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `interview-prep/{company}-{role}.md` | Company-specific interview intel reports |
| `analyze-patterns.mjs` | Pattern analysis script (JSON output) |
| `followup-cadence.mjs` | Follow-up cadence calculator (JSON output) |
| `data/follow-ups.md` | Follow-up history tracker |
| `scan.mjs` | Job portal scanner |
| `check-liveness.mjs` | Job posting liveness checker |
| `liveness-core.mjs` | Shared liveness logic |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`) |

### First Run — Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.zh.yml)?
3. Does `modes/_profile.md` exist?
4. Does `portals.yml` exist?
5. **HARD GATE: Run `node scripts/check-onboarding.mjs`.** If exit code ≠ 0, the check has failed. Do NOT proceed with evaluations, scans, or any other mode until the user fixes the reported issues. Display the error output to the user.

**If check-onboarding.mjs fails, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place. Guide the user step by step:

#### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

#### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `config/profile.example.zh.yml` and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'AI产品经理', '高级后端工程师')
> - Your salary target range (税前月薪/K)
>
> I'll set everything up for you."

Fill in `config/profile.yml` with their answers. For archetypes and targeting narrative, store the user-specific mapping in `modes/_profile.md` or `config/profile.yml` rather than editing `modes/_shared.md`.

#### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with your target companies. Want me to customize the search keywords for your target roles?"

Create `portals.yml` with the user's target companies and roles.

#### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

#### Step 5: Get to know the user (important for quality)

After the basics are set up, proactively ask for more context:
> "The basics are ready. But the system works much better when it knows you well. Can you tell me more about:
> - What makes you unique? What's your 'superpower' that other candidates don't have?
> - What kind of work excites you? What drains you?
> - Any deal-breakers? (e.g., no 996, no 外包, prefer 国企)
> - Your best professional achievement — the one you'd lead with in an interview
> - Any projects, articles, or case studies you've published?
>
> The more context you give me, the better I filter."

Store any insights the user shares in `config/profile.yml` (under narrative), `modes/_profile.md`, or in `article-digest.md`. Do not put user-specific archetypes or framing into `modes/_shared.md`.

**After every evaluation, learn.** If the user says "this score is too high, I wouldn't apply here" or "you missed that I have experience in X", update your understanding in `modes/_profile.md`, `config/profile.yml`, or `article-digest.md`.

#### Step 6: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/career-ops scan` to search portals
> - Run `/career-ops` to see all commands
>
> Everything is customizable — just ask me to change anything."

### Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/AI] roles" → edit `modes/_profile.md` or `config/profile.yml`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_profile.md` for user-specific weighting

### Language Modes

Default modes are in `modes/` (English). Chinese-specific modes are in `modes/zh/`:
- `modes/zh/_shared.md` — Scoring engine with China-specific vocabulary (五险一金, 税前/税后, 13薪/14薪, 公积金, 竞业限制, 996/大小周, 试用期, 劳动合同, 外包/本部/劳务派遣)
- `modes/zh/_profile.md` — User archetypes for Chinese market roles
- `modes/zh/jianzhi.md` — JD evaluation mode
- `modes/zh/auto-pipeline.md` — Auto-pipeline mode
- `modes/zh/pipeline.md` — Pipeline processing
- `modes/zh/pdf.md` — PDF CV generation

**When to use Chinese modes:** The user is targeting Chinese-language job postings or lives in China.
**When NOT to:** If the user applies to English-language roles, use the default English modes.

### Skill Modes

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | auto-pipeline. Use `modes/zh/jianzhi.md` for Chinese JDs. |
| Asks to evaluate offer | `jianzhi` (ZH) or `oferta` (EN) |
| Asks to compare offers | `ofertas` |
| Asks for company research | `deep` |
| Preps for interview at specific company | `interview-prep` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |
| Asks about rejection patterns or wants to improve targeting | `patterns` |
| Asks about follow-ups or application cadence | `followup` |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **NEVER submit an application without the user reviewing it first.**
- **Strongly discourage low-fit applications.** If a score is below 4.0/5, explicitly recommend against applying.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50.
- **Respect recruiters' time.** Every application a human reads costs someone's attention.

---

## Offer Verification -- MANDATORY

**NEVER trust WebSearch/WebFetch to verify if an offer is still active.** ALWAYS use Playwright:
1. `browser_navigate` to the URL
2. `browser_snapshot` to read content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

---

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data)
- Scripts in `.mjs`, configuration in YAML
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **RULE: After each evaluation, persist data via `node scripts/db-write.mjs`** (writes to SQLite, the canonical data store). See `scripts/db-write.mjs` for usage.
- **RULE: NEVER create new entries in applications.md if company+role already exists.** Update the existing entry via db-write.mjs (ON CONFLICT handles dedup).

### Data Persistence (SQLite)

**Primary path:** After evaluation, call `node scripts/db-write.mjs`:

```bash
# Application record
node scripts/db-write.mjs --action upsertApp --data '{"num":42,"date":"2026-05-08","company":"Acme Corp","role":"AI PM","score":4.2,"status":"Evaluated","pdf_generated":0,"report_path":"reports/042-acme-2026-05-08.md","notes":""}'

# Report metadata
node scripts/db-write.mjs --action upsertReport --data '{"report_num":42,"date":"2026-05-08","company":"Acme Corp","role":"AI PM","archetype":"AI产品经理","overall_score":4.2,"legitimacy":"高可信度","blocks_json":"{}","keywords_json":"[]"}'
```

**Fallback:** If `db-write.mjs` is unavailable, write TSV to `batch/tracker-additions/{num}-{company-slug}.tsv` (see merge-tracker.mjs for legacy format).

### Pipeline Integrity

1. **NEVER edit applications.md to ADD new entries** -- Use `node scripts/db-write.mjs` to write to SQLite. TSV in `batch/tracker-additions/` is fallback only.
2. **YES you can edit applications.md to UPDATE status/notes of existing entries** (legacy read-only path). Preferred: use db-write.mjs.
3. All reports MUST include `**URL:**` in the header. Include `**Legitimacy:** {tier}`.
4. All statuses MUST be canonical (see `templates/states.yml` — the single source of truth).
5. After each evaluation, validate output: `node scripts/validate-output.mjs --data '<json>'` before persisting.
6. Health check: `node verify-pipeline.mjs`
7. Normalize statuses: `node normalize-statuses.mjs`

### Canonical States

**Source of truth:** `templates/states.yml` — Read this file for the authoritative list of valid application statuses, their canonical labels, and aliases. Do NOT hardcode status values.

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
