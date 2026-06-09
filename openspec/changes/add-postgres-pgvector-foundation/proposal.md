# Change: add-postgres-pgvector-foundation

## Why

The project has outgrown a local SQLite-only persistence layer. Multi-user LAN use, durable report storage, and future semantic memory require a server-grade database foundation before any data migration or agent-memory work begins.

## What Changes

- Add PostgreSQL connection configuration and health checks.
- Enable the `pgvector` extension in the database bootstrap path.
- Add a PostgreSQL schema baseline that mirrors the current durable SQLite tables without switching runtime traffic.
- Introduce a database driver boundary so later changes can choose SQLite or PostgreSQL explicitly.
- Document local LAN deployment configuration for PostgreSQL.
- No production/default cutover happens in this change.

## Capabilities

### New Capabilities

- `postgres-pgvector-foundation`: PostgreSQL connectivity, pgvector availability, schema bootstrap, and non-cutover driver selection.

### Modified Capabilities

- None.

## Impact

- Affected areas: `package.json`, `.env.example`, database connection modules, database schema files, health checks, setup docs.
- New external dependency likely required: PostgreSQL client library for Node.js.
- Deployment impact: local/LAN deployments will need a PostgreSQL service and `DATABASE_URL`, but SQLite remains available until cutover.
