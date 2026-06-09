# Change: cutover-server-data-to-postgres

## Why

After data is migrated, the app must stop treating SQLite, Dexie, and localStorage as competing facts. PostgreSQL should become the server-side source of truth while client storage becomes cache-only.

## What Changes

- Route server API reads and writes through a database adapter selected by `DB_DRIVER`.
- Allow PostgreSQL runtime after migration verification.
- Keep SQLite as fallback only when explicitly selected.
- Reduce Dexie/localStorage from fact storage to cache/draft behavior.
- Add regression tests for multi-user isolation, reports, CV data, sessions, and offer/JD storage.

## Capabilities

### New Capabilities

- `postgres-data-cutover`: Runtime data access through PostgreSQL with explicit fallback and cache-only client storage.

### Modified Capabilities

- None.

## Impact

- Affected areas: API routes importing `server-db`, CV storage, JD/report storage, sessions, profile routes, agent tools that read server data, Dexie/localStorage fallback code.
- Depends on `migrate-sqlite-to-postgres-data`.
- This is the first change that can affect live LAN behavior.
