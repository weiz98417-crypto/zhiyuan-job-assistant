## 1. Migration Inventory

- [ ] 1.1 Enumerate SQLite tables and columns at runtime.
- [ ] 1.2 Map each SQLite table to the PostgreSQL baseline table.
- [ ] 1.3 Identify nullable `user_id` rows and require a default owner strategy.
- [ ] 1.4 Document tables intentionally excluded from migration, if any.

## 2. Migration Script

- [ ] 2.1 Add `scripts/migrate-sqlite-to-postgres.mjs`.
- [ ] 2.2 Implement `--dry-run`, `--apply`, and `--verify-only` modes.
- [ ] 2.3 Preserve ids or create deterministic id maps where PostgreSQL types differ.
- [ ] 2.4 Preserve `report_num`, JD/report links, offer/report links, session ids, and timestamps.
- [ ] 2.5 Parse and validate JSON fields before insertion into `jsonb`.

## 3. Verification Script

- [ ] 3.1 Add `scripts/check-postgres-migration.mjs`.
- [ ] 3.2 Compare source and target row counts by table.
- [ ] 3.3 Sample key records and compare important JSON fields.
- [ ] 3.4 Verify per-user data isolation after migration.
- [ ] 3.5 Emit a human-readable verification report.

## 4. Tests And Runbook

- [ ] 4.1 Add fixture-based migration tests with a temporary SQLite DB.
- [ ] 4.2 Test null `user_id` backfill behavior.
- [ ] 4.3 Add a migration runbook with backup and rollback steps.
- [ ] 4.4 Validate this OpenSpec change.
