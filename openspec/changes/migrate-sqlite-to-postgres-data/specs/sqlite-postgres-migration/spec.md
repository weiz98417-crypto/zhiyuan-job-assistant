# Spec Delta: SQLite PostgreSQL Migration

## ADDED Requirements

### Requirement: Migration supports dry-run before apply

The migration tool SHALL support inspecting migration impact without writing to PostgreSQL.

#### Scenario: Dry run migration

- **WHEN** the operator runs the migration in dry-run mode
- **THEN** the tool SHALL report source tables, row counts, target mappings, missing owners, and potential conflicts
- **AND** it SHALL NOT insert, update, or delete PostgreSQL data

### Requirement: Migration preserves durable user data

The migration tool SHALL preserve current durable SQLite data in PostgreSQL.

#### Scenario: Apply migration

- **WHEN** the operator runs the migration in apply mode after a successful dry run
- **THEN** users, applications, reports, JDs, profiles, profile signals, sessions, CV data, offers, offer reports, stories, preferences, and session memory SHALL be copied to PostgreSQL
- **AND** public identifiers such as `report_num` SHALL remain stable

### Requirement: Migration handles missing user ownership explicitly

The migration tool SHALL not silently assign private rows with missing `user_id`.

#### Scenario: Missing user owner

- **WHEN** SQLite rows with null `user_id` are found
- **THEN** the migration SHALL require an explicit default owner or abort
- **AND** every ownership assignment SHALL be logged in the verification report

### Requirement: Migration verification is required

The migration process SHALL produce a verification report before runtime cutover.

#### Scenario: Verification succeeds

- **WHEN** verification runs after migration
- **THEN** it SHALL compare row counts, key identifiers, sampled JSON payloads, and per-user isolation
- **AND** it SHALL report success only when all required checks pass
