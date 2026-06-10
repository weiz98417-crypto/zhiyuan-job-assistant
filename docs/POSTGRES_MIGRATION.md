# PostgreSQL Migration Runbook

This runbook migrates durable server-side data from `data/zhiyuan.db` into PostgreSQL with pgvector available. It does not switch the app runtime to PostgreSQL.

## Preconditions

- PostgreSQL is reachable through `DATABASE_URL`.
- `npm run check:postgres` passes.
- The PostgreSQL database is empty or intentionally prepared for an idempotent re-run.
- Choose a default owner for legacy private rows with missing `user_id`.

Find an owner in SQLite:

```powershell
node -e "const Database=require('better-sqlite3'); const db=new Database('data/zhiyuan.db',{readonly:true}); console.table(db.prepare('SELECT id, username, role, status FROM users').all()); db.close();"
```

## Backup

Stop app writes before taking the backup if this is a production/LAN migration.

```powershell
New-Item -ItemType Directory -Force data/backups | Out-Null
Copy-Item data/zhiyuan.db data/backups/zhiyuan-before-postgres.db
Copy-Item data/zhiyuan.db-wal data/backups/zhiyuan-before-postgres.db-wal -ErrorAction SilentlyContinue
Copy-Item data/zhiyuan.db-shm data/backups/zhiyuan-before-postgres.db-shm -ErrorAction SilentlyContinue
```

## Dry Run

Dry-run writes nothing to PostgreSQL. It reports runtime SQLite tables, row counts, target mappings, missing owners, JSON errors, and target conflicts.

```powershell
$env:DATABASE_URL="postgresql://postgres@localhost:55432/zhiyuan"
npm run migrate:postgres -- --dry-run --default-owner admin --report reports/postgres-migration-dry-run.md
```

If `Can apply: no`, fix the reported owner, JSON, or conflict issues before applying.

## Apply

Apply runs in a PostgreSQL transaction and bootstraps the baseline schema first.

```powershell
$env:DATABASE_URL="postgresql://postgres@localhost:55432/zhiyuan"
npm run migrate:postgres -- --apply --default-owner admin --report reports/postgres-migration-apply.md
```

The tool preserves primary ids, `report_num`, JD/report links, offer/report links, session ids, timestamps, and JSON payloads.

## Verify

Verification is required before any cutover. It compares source/target row counts, sampled JSON payloads, and per-user isolation counts.

```powershell
$env:DATABASE_URL="postgresql://postgres@localhost:55432/zhiyuan"
npm run check:postgres-migration -- --default-owner admin --report reports/postgres-migration-verify.md
```

Only proceed to the cutover change when the report says `Status: PASS`.

## Runtime Cutover Checks

After setting `DB_DRIVER=postgres`, run the cutover checklist:

```powershell
$env:DB_DRIVER="postgres"
$env:DATABASE_URL="postgresql://postgres@localhost:55432/zhiyuan"
npm run check:postgres-cutover
```

The `runtime_sqlite_imports` gate must pass before SQLite can be treated as an archive. The migration/hash gate may fail after Postgres has received new writes; that means SQLite is no longer an exact live mirror and should not be used as a rollback target without a deliberate resync plan.

## PostgreSQL Backup And Restore

For local/LAN deployments, use the Node JSON backup when `pg_dump` or `psql` is not installed:

```powershell
npm run backup:postgres -- --output data/backups/postgres-after-cutover.json
```

Restore is dry-run by default:

```powershell
npm run restore:postgres -- --input data/backups/postgres-after-cutover.json
```

To restore into an empty database:

```powershell
npm run restore:postgres -- --input data/backups/postgres-after-cutover.json --apply
```

To replace an existing target database, require both explicit flags:

```powershell
npm run restore:postgres -- --input data/backups/postgres-after-cutover.json --apply --allow-overwrite
```

## SQLite Archive Mode

When `DB_DRIVER=postgres`, direct SQLite runtime access is blocked. For intentional archive inspection only:

```powershell
$env:ALLOW_SQLITE_LEGACY="readonly"
```

This opens `data/zhiyuan.db` as a read-only archive. It must not be used for production writes.

## Excluded Tables

These SQLite tables are intentionally not migrated:

- `sqlite_sequence`: SQLite internal autoincrement bookkeeping.
- `reference_resumes_fts`
- `reference_resumes_fts_config`
- `reference_resumes_fts_data`
- `reference_resumes_fts_docsize`
- `reference_resumes_fts_idx`

The `reference_resumes_fts*` tables are derived full-text-search indexes. PostgreSQL search/indexing will be rebuilt separately if needed; the durable source is `reference_resumes`.

## Rollback

This migration leaves SQLite untouched. Before runtime cutover, rollback is simply:

- Keep `DB_DRIVER=sqlite`.
- Keep using `data/zhiyuan.db`.
- Drop and recreate the PostgreSQL database if you want to retry from a clean target.

After a future runtime cutover, rollback must follow that cutover change's rollback plan because PostgreSQL may contain new writes that SQLite does not have.
