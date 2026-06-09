## 1. Migration Inventory

- [x] 1.1 Enumerate SQLite tables and columns at runtime.
- [x] 1.2 Map each SQLite table to the PostgreSQL baseline table.
- [x] 1.3 Identify nullable `user_id` rows and require a default owner strategy.
- [x] 1.4 Document tables intentionally excluded from migration, if any.

## 2. Migration Script

- [x] 2.1 Add `scripts/migrate-sqlite-to-postgres.mjs`.
- [x] 2.2 Implement `--dry-run`, `--apply`, and `--verify-only` modes.
- [x] 2.3 Preserve ids or create deterministic id maps where PostgreSQL types differ.
- [x] 2.4 Preserve `report_num`, JD/report links, offer/report links, session ids, and timestamps.
- [x] 2.5 Parse and validate JSON fields before insertion into `jsonb`.

## 3. Verification Script

- [x] 3.1 Add `scripts/check-postgres-migration.mjs`.
- [x] 3.2 Compare source and target row counts by table.
- [x] 3.3 Sample key records and compare important JSON fields.
- [x] 3.4 Verify per-user data isolation after migration.
- [x] 3.5 Emit a human-readable verification report.

## 4. Tests And Runbook

- [x] 4.1 Add fixture-based migration tests with a temporary SQLite DB.
- [x] 4.2 Test null `user_id` backfill behavior.
- [x] 4.3 Add a migration runbook with backup and rollback steps.
- [x] 4.4 Validate this OpenSpec change.
