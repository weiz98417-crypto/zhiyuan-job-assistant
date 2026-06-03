# Design: add-postgres-pgvector-foundation

## Context

The current server database is initialized through `src/lib/server-db.ts` and `src/lib/server-schema.sql` using `better-sqlite3`. The project also has client-side Dexie/localStorage fallbacks. This change only creates a PostgreSQL foundation; it does not move data or change app runtime behavior.

## Goals / Non-Goals

**Goals:**

- Provide a PostgreSQL connection layer usable by later changes.
- Verify `pgvector` is installed and available.
- Create a PostgreSQL schema baseline for existing durable server tables.
- Keep SQLite as the default runtime path until a later cutover change.

**Non-Goals:**

- Do not migrate existing SQLite data.
- Do not remove `better-sqlite3`.
- Do not change agent behavior.
- Do not create embeddings or memory retrieval yet.

## Decisions

- Use a thin SQL client layer first, not a full ORM migration. This keeps the migration close to the current SQL-heavy code and avoids introducing ORM behavior while debugging data correctness.
- Keep `DB_DRIVER=sqlite|postgres` explicit. Auto-detecting from `DATABASE_URL` is convenient but risky in LAN deployments because an accidental env var could switch persistence unexpectedly.
- Run `CREATE EXTENSION IF NOT EXISTS vector` as part of database bootstrap, but do not create vector tables yet. The extension belongs to foundation; memory schema belongs to the vector-memory change.
- Mirror current table behavior before redesigning names. Renames such as `reports` -> `jd_reports` can wait until the data is safely portable.

## Risks / Trade-offs

- PostgreSQL schema drift from SQLite schema -> mitigate by writing schema comparison notes and migration tests in the next change.
- Extra dependency without immediate user-visible benefit -> mitigate by keeping this change small and validating health only.
- Local setup friction -> mitigate with `.env.example` and LAN setup notes.

## Migration Plan

1. Add dependency and connection module.
2. Add PostgreSQL bootstrap SQL.
3. Add a health/doctor check that proves PostgreSQL and pgvector are available.
4. Keep app runtime on SQLite unless `DB_DRIVER=postgres` is explicitly used in later test paths.

Rollback is simply removing the new config/dependency or leaving `DB_DRIVER=sqlite`.

## Open Questions

- Final embedding model and vector dimension are intentionally undecided here.
- Hosted PostgreSQL choice for production/LAN is outside this change.
