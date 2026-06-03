# Spec Delta: PostgreSQL Data Cutover

## ADDED Requirements

### Requirement: Server APIs use the selected authoritative database

When a database driver is selected, server APIs SHALL read and write authoritative data through that driver.

#### Scenario: PostgreSQL driver selected

- **WHEN** `DB_DRIVER=postgres` is configured after migration verification
- **THEN** server APIs SHALL read and write authoritative users, CV data, reports, JDs, offers, sessions, and profile signals from PostgreSQL
- **AND** they SHALL not silently fall back to SQLite or browser storage

#### Scenario: SQLite driver selected

- **WHEN** `DB_DRIVER=sqlite` is configured
- **THEN** server APIs SHALL continue using the existing SQLite-backed storage path

### Requirement: Client storage is not authoritative after cutover

Authenticated client pages SHALL treat Dexie/localStorage as cache or draft storage, not as the source of truth.

#### Scenario: Server data load succeeds

- **WHEN** an authenticated page loads server data successfully
- **THEN** the UI SHALL render server data as authoritative
- **AND** any local cache SHALL be refreshed or ignored according to the page contract

#### Scenario: Server data load fails

- **WHEN** an authenticated page cannot load authoritative server data
- **THEN** the UI SHALL show a visible error or retry state
- **AND** it SHALL not silently render stale local data as if it were current

### Requirement: Multi-user isolation survives cutover

PostgreSQL runtime SHALL enforce per-user data isolation for private job-search data.

#### Scenario: User reads private data

- **WHEN** a user requests CV data, reports, sessions, offers, or profile signals
- **THEN** the server SHALL return only records owned by that user unless the route is explicitly admin-scoped
