# Change: migrate-sqlite-to-postgres-data

## Why

Before the app can rely on PostgreSQL, existing SQLite data must be migrated safely and verifiably. The migration must preserve users, reports, CV data, sessions, and profile evidence without forcing a runtime cutover.

## What Changes

- Add a one-time SQLite-to-PostgreSQL migration script.
- Add a dry-run mode that reports planned inserts and schema mismatches.
- Add a verification script that compares row counts, key identifiers, and sampled JSON payloads.
- Preserve SQLite as a read-only backup after migration.
- Define user ownership handling for rows with missing `user_id`.

## Capabilities

### New Capabilities

- `sqlite-postgres-migration`: Safe, repeatable data migration and validation from SQLite to PostgreSQL.

### Modified Capabilities

- None.

## Impact

- Affected areas: `scripts/`, database schema docs, migration runbook, tests for data isolation and report/JD associations.
- Depends on `add-postgres-pgvector-foundation`.
- No API cutover or agent behavior change in this change.
