# Scripts Reference

All commands below are exposed through `package.json`.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js development server. |
| `npm run build` | Build the production app. |
| `npm run start` | Start the built app. Runs `prestart` first. |
| `npm run build:railway` | Build for Railway with browser downloads skipped. |
| `npm run doctor` | Validate local prerequisites and project setup. |
| `npm run check-onboarding` | First-run onboarding validation. |

## Testing And Evals

| Command | Purpose |
| --- | --- |
| `npm run test` | Run the Vitest suite. |
| `npm run eval:memory` | Run deterministic long-term memory evals. |
| `npm run smoke:embedding` | Opt-in live embedding provider smoke test. |
| `npx tsc --noEmit` | Type-check without emitting files. |

`eval:memory` uses local fixtures and deterministic keyword embeddings. It does not call PostgreSQL, pgvector, OCR, or a live model provider.

`smoke:embedding` reads local secrets and must not print API keys or authorization headers.

## PostgreSQL And Migration

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run check:postgres` | `scripts/check-postgres.mjs` | Verify `DATABASE_URL`, connectivity, and pgvector availability. |
| `npm run check:postgres-cutover` | `scripts/check-postgres-cutover.mjs` | Report runtime driver, SQLite runtime reachability, row counts, and migration hash gates. |
| `npm run backup:postgres` | `scripts/backup-postgres.mjs` | Write a self-contained JSON backup for local/LAN PostgreSQL deployments. |
| `npm run restore:postgres` | `scripts/restore-postgres.mjs` | Dry-run or apply a JSON backup restore into PostgreSQL. |
| `npm run migrate:postgres` | `scripts/migrate-sqlite-to-postgres.mjs` | Dry-run or apply SQLite to PostgreSQL migration. |
| `npm run check:postgres-migration` | `scripts/check-postgres-migration.mjs` | Compare source/target counts, samples, and user isolation after migration. |

Common sequence:

```bash
npm run check:postgres
npm run migrate:postgres -- --dry-run --default-owner admin --report reports/postgres-migration-dry-run.md
npm run migrate:postgres -- --apply --default-owner admin --report reports/postgres-migration-apply.md
npm run check:postgres-migration -- --default-owner admin --report reports/postgres-migration-verify.md
npm run check:postgres-cutover
npm run backup:postgres -- --output data/backups/postgres-after-cutover.json
```

## Memory And Profile Maintenance

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run backfill:memory` | `scripts/backfill-memory.mjs` | Backfill memory chunks/embeddings for existing reference resumes. |
| `npm run cleanup:profile-signals` | `scripts/cleanup-profile-signals.mjs` | Remove low-quality profile signals and duplicate fragments. |

Use `cleanup:profile-signals` after changing extraction quality gates or after importing noisy conversation history.

## Discovery Scanner

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run scan` | `scan.mjs` | Legacy zero-token portal scan. |
| `npm run scan:worker` | `scripts/scan-worker.mjs` | Run the discovery worker loop. |
| `npm run scan:once` | `scripts/scan-worker.mjs --once` | Process one discovery cycle. |
| `npm run scan-risks` | `scripts/scan-risks.mjs` | Run JD risk pattern detection. |

The web app discovery UI uses `/api/scan/*` routes and the `scan_queue`/`scan_jobs` tables. Some scanner flows are intentionally conservative during PostgreSQL migration to avoid stuck pending jobs.

## Legacy Career-Ops Utilities

These remain for compatibility with the original project data files:

| Command | Purpose |
| --- | --- |
| `npm run verify` | Check legacy pipeline data integrity. |
| `npm run normalize` | Normalize legacy application statuses. |
| `npm run dedup` | De-duplicate legacy tracker entries. |
| `npm run merge` | Merge legacy batch TSV tracker additions. |
| `npm run pdf` | Convert HTML to PDF. |
| `npm run sync-check` | Validate legacy CV/profile consistency. |
| `npm run liveness` | Check whether job URLs still look active. |

## Turso Compatibility

| Command | Purpose |
| --- | --- |
| `npm run turso-push` | Push local SQLite data to Turso if configured. |
| `npm run prestart` | Pull Turso data before `npm start`. |

PostgreSQL/pgvector is now the strategic database path for durable server data and long-term memory. Turso commands are retained for existing deployments.
