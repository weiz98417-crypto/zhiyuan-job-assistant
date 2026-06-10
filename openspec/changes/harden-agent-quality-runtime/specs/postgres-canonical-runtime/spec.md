# Spec Delta: Postgres Canonical Runtime

## ADDED Requirements

### Requirement: Postgres is the production source of truth

When `DB_DRIVER=postgres`, server runtime reads and writes SHALL use Postgres-backed repositories for production data.

#### Scenario: Postgres mode active

- **WHEN** the app starts with `DB_DRIVER=postgres`
- **THEN** production server routes SHALL use Postgres repositories for CV data, sessions, reports, JDs, offers, profile signals, memory, and reference resumes
- **AND** they SHALL NOT instantiate SQLite as the canonical write store

#### Scenario: SQLite archive preserved

- **WHEN** Postgres mode is active but SQLite data still exists
- **THEN** SQLite MAY be used as an explicit read-only migration or recovery archive
- **AND** any archive read SHALL be intentional and logged as recovery/migration behavior

### Requirement: SQLite retirement gates

SQLite runtime dependencies SHALL NOT be removed until migration and rollback gates pass.

#### Scenario: Cutover checklist passes

- **WHEN** row counts, critical hashes, repository routing, backup, restore, and rollback checks pass
- **THEN** the project MAY remove SQLite from production runtime paths
- **AND** keep a documented archive export if historical recovery is still needed

#### Scenario: Cutover checklist fails

- **WHEN** any critical table is missing, hash mismatched, or backup/restore is unproven
- **THEN** SQLite retirement SHALL be blocked
- **AND** the checklist SHALL report the failing gate

### Requirement: Postgres backup and restore

Local and LAN deployments SHALL have explicit backup and restore commands before SQLite is retired.

#### Scenario: Backup command runs

- **WHEN** an admin runs the backup command
- **THEN** the system SHALL produce a timestamped Postgres backup artifact
- **AND** record enough metadata to identify database name, driver, and schema version

#### Scenario: Restore drill

- **WHEN** a restore drill is executed against a test database
- **THEN** the restored database SHALL pass smoke checks for login, CV data, sessions, reports, and memory retrieval
