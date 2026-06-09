# Spec Delta: PostgreSQL pgvector Foundation

## ADDED Requirements

### Requirement: PostgreSQL foundation is opt-in

The system SHALL support configuring a PostgreSQL connection without changing the default SQLite runtime path.

#### Scenario: Default driver remains SQLite

- **WHEN** the app starts without `DB_DRIVER=postgres`
- **THEN** existing SQLite-backed behavior SHALL remain the runtime default
- **AND** no PostgreSQL connection SHALL be required for existing local startup

#### Scenario: PostgreSQL driver is selected explicitly

- **WHEN** `DB_DRIVER=postgres` and `DATABASE_URL` are configured
- **THEN** the server SHALL be able to open a PostgreSQL connection
- **AND** the connection check SHALL fail with an actionable error if PostgreSQL is unavailable

### Requirement: pgvector extension is available

The PostgreSQL bootstrap path SHALL verify that the `vector` extension can be created or already exists.

#### Scenario: pgvector installed

- **WHEN** the PostgreSQL foundation check runs against a database with pgvector installed
- **THEN** the check SHALL confirm the `vector` extension is available

#### Scenario: pgvector missing

- **WHEN** the PostgreSQL foundation check runs against a database without pgvector support
- **THEN** the check SHALL fail with a message that tells the operator to install or enable pgvector

### Requirement: PostgreSQL schema baseline exists

The system SHALL provide a PostgreSQL schema baseline for current durable server-side data before migration begins.

#### Scenario: Schema bootstrap runs

- **WHEN** the PostgreSQL schema bootstrap is executed
- **THEN** it SHALL create the current durable tables needed for users, sessions, CV data, JDs, reports, offers, stories, preferences, and profile signals
- **AND** it SHALL use PostgreSQL-native `jsonb` and `timestamptz` types where applicable
