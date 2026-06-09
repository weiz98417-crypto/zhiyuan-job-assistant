## 1. PostgreSQL Setup

- [x] 1.1 Add PostgreSQL client dependency and environment variables.
- [x] 1.2 Add `DATABASE_URL` and `DB_DRIVER` examples to `.env.example`.
- [x] 1.3 Add local/LAN PostgreSQL setup notes, including pgvector availability.

## 2. Connection Layer

- [x] 2.1 Add a server-side PostgreSQL connection module with pooled queries.
- [x] 2.2 Add explicit driver selection without changing the default SQLite runtime.
- [x] 2.3 Add a database health check that verifies PostgreSQL connectivity.
- [x] 2.4 Add a pgvector availability check using `CREATE EXTENSION IF NOT EXISTS vector`.

## 3. Schema Baseline

- [x] 3.1 Create a PostgreSQL schema baseline for current durable SQLite tables.
- [x] 3.2 Convert SQLite `TEXT` JSON columns to PostgreSQL `jsonb` where appropriate.
- [x] 3.3 Convert datetime defaults to `timestamptz`.
- [x] 3.4 Document known schema differences that migration must handle.

## 4. Verification

- [x] 4.1 Run the new database health check against a local PostgreSQL instance.
- [x] 4.2 Run existing tests with the default SQLite driver to prove no cutover happened.
- [x] 4.3 Validate this OpenSpec change.
