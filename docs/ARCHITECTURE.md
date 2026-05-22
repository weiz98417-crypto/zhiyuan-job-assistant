# Architecture

## System Overview

```
                    ┌─────────────────────────────────┐
                    │         Claude Code Agent        │
                    │   (reads CLAUDE.md + modes/*.md) │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                       │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌───────────▼────────┐
     │ Single Eval  │   │ Portal Scan │   │   Batch Process    │
     │ (auto-pipe)  │   │  (scan.md)  │   │   (batch-runner)   │
     └──────┬──────┘   └──────┬──────┘   └───────────┬────────┘
            │                  │                       │
            │           ┌──────▼──────┐          ┌────▼─────┐
            │           │ pipeline.md │          │ N workers│
            │           │ (URL inbox) │          │ (claude -p)
            │           └─────────────┘          └────┬─────┘
            │                                          │
     ┌──────▼──────────────────────────────────────────▼──────┐
     │                    Output Pipeline                      │
     │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐  │
     │  │ Report.md│  │  PDF (HTML  │  │ Tracker TSV       │  │
     │  │ (A-F eval)│  │  → Puppeteer)│  │ (merge-tracker)  │  │
     │  └──────────┘  └────────────┘  └───────────────────┘  │
     └────────────────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  data/applications.md │
                    │  (canonical tracker)  │
                    └──────────────────────┘
```

## Evaluation Flow (Single Offer)

1. **Input**: User pastes JD text or URL
2. **Extract**: Playwright/WebFetch extracts JD from URL
3. **Classify**: Detect archetype (1 of 6 types)
4. **Evaluate**: 6 blocks (A-F):
   - A: Role summary
   - B: CV match (gaps + mitigation)
   - C: Level strategy
   - D: Comp research (WebSearch)
   - E: CV personalization plan
   - F: Interview prep (STAR stories)
5. **Score**: Weighted average across 10 dimensions (1-5)
6. **Report**: Save as `reports/{num}-{company}-{date}.md`
7. **PDF**: Generate ATS-optimized CV (`generate-pdf.mjs`)
8. **Track**: Write TSV to `batch/tracker-additions/`, auto-merged

## Batch Processing

The batch system processes multiple offers in parallel:

```
batch-input.tsv    →  batch-runner.sh  →  N × claude -p workers
(id, url, source)     (orchestrator)       (self-contained prompt)
                           │
                    batch-state.tsv
                    (tracks progress)
```

Each worker is a headless Claude instance (`claude -p`) that receives the full `batch-prompt.md` as context. Workers produce:
- Report .md
- PDF
- Tracker TSV line

The orchestrator manages parallelism, state, retries, and resume.

## Data Flow

```
cv.md                    →  Evaluation context
article-digest.md        →  Proof points for matching
config/profile.yml       →  Candidate identity
portals.yml              →  Scanner configuration
templates/states.yml     →  Canonical status values
templates/cv-template.html → PDF generation template
```

## File Naming Conventions

- Reports: `{###}-{company-slug}-{YYYY-MM-DD}.md` (3-digit zero-padded)
- PDFs: `cv-candidate-{company-slug}-{YYYY-MM-DD}.pdf`
- Tracker TSVs: `batch/tracker-additions/{id}.tsv`

## Job Scan System (NEW)

Automated job discovery from 32 Chinese company career sites (Moka/Beisen/custom pages) with dual-channel architecture:

```
  /discover UI
       │
  POST /api/scan  ──►  scan_queue (SQLite)
       │                    │
       └────────────────────┼──────────────────┐
                            ▼                   │
                    scan-worker.mjs              │
                    (poll + CAS claim)           │
                            │                   │
              ┌─────────────┼─────────────┐     │
              ▼             ▼             ▼     │
         Moka Adapter  Beisen Adapter  LLM Ext  │
         (12 companies) (5 companies)  (15 cust)│
              │             │             │     │
              └─────────────┼─────────────┘     │
                            ▼                   │
                    scan_jobs (SQLite)          │
                    (dedup by URL hash)         │
                            │                   │
              ┌─────────────┼─────────────┐     │
              ▼             ▼             ▼     │
        GET /api/scan/jobs   PATCH dismiss  POST pipeline/enqueue
        GET /api/scan/status  GET /api/scan/history
```

**Adapter architecture:**
- `lib/scan/adapters/router.mjs` — registry mapping `ats_type` → adapter
- API channel: Greenhouse/Lever (public JSON APIs, zero Playwright)
- Playwright channel: Moka (scroll extraction), Beisen (pagination), Custom (LLM-based)
- `lib/scan/orchestrator.mjs` — shared logic for API routes + worker
- `scripts/scan-worker.mjs` — background daemon, polls `scan_queue`, CAS task claiming
- `server.mjs` — custom Next.js entry that forks the worker with crash recovery

**Key files:**
| File | Purpose |
|------|---------|
| `lib/scan/adapters/*.mjs` | 5 adapters + router + types + LLM extractor |
| `lib/scan/orchestrator.mjs` | Scan lifecycle: create, status, jobs CRUD, history |
| `scripts/scan-worker.mjs` | Background worker daemon |
| `server.mjs` | Custom server entry with worker supervision |
| `src/app/api/scan/*` | 6 REST endpoints (POST trigger, GET status/jobs/history, PATCH dismiss) |
| `src/app/api/pipeline/enqueue` | Bridge from scan results to evaluation pipeline |
| `src/app/discover/page.tsx` | Job Discovery UI with real-time scan progress |

## Pipeline Integrity

Scripts maintain data consistency:

| Script | Purpose |
|--------|---------|
| `merge-tracker.mjs` | Merges batch TSV additions into applications.md |
| `verify-pipeline.mjs` | Health check: statuses, duplicates, links |
| `dedup-tracker.mjs` | Removes duplicate entries by company+role |
| `normalize-statuses.mjs` | Maps status aliases to canonical values |
| `cv-sync-check.mjs` | Validates setup consistency |

## Dashboard TUI

The `dashboard/` directory contains a standalone Go TUI application that visualizes the pipeline:

- Filter tabs: All, Evaluada, Aplicado, Entrevista, Top >=4, No Aplicar
- Sort modes: Score, Date, Company, Status
- Grouped/flat view
- Lazy-loaded report previews
- Inline status picker
