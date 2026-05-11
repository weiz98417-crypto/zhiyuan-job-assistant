## ADDED Requirements

### Requirement: Agent writes applications via db-write.mjs
Agent SHALL persist application records by calling `node scripts/db-write.mjs --action upsertApp --data '<json>'` instead of writing TSV files to `batch/tracker-additions/`.

#### Scenario: Agent persists a new evaluation
- **WHEN** Agent completes a JD evaluation and generates a report
- **THEN** Agent calls `scripts/db-write.mjs --action upsertApp` with JSON containing `{num, date, company, role, score, status, pdf_generated, report_path, notes}`
- **AND** the script inserts or updates the applications table via `ON CONFLICT(company, role)`
- **AND** returns exit code 0 on success

#### Scenario: Agent updates an existing application
- **WHEN** Agent re-evaluates a company+role that already exists in SQLite
- **THEN** `upsertApp` updates `score`, `status`, `report_path`, `notes`, `updated_at` without creating a duplicate row

#### Scenario: db-write.mjs unavailable
- **WHEN** `scripts/db-write.mjs` exits with non-zero code
- **THEN** Agent SHALL fall back to writing a TSV file to `batch/tracker-additions/` and warn the user that SQLite write failed

### Requirement: Agent writes reports via db-write.mjs
Agent SHALL persist report metadata by calling `node scripts/db-write.mjs --action upsertReport --data '<json>'`.

#### Scenario: Report metadata persisted
- **WHEN** Agent generates a new evaluation report at `reports/042-bytedance-2026-05-08.md`
- **THEN** Agent calls `upsertReport` with JSON containing `{report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json}`

### Requirement: batch/tracker-additions directory is no longer the primary write target
`CLAUDE.md` SHALL be updated to remove instructions directing Agent to write TSV files. The TSV path remains as fallback only.

#### Scenario: Agent follows updated CLAUDE.md
- **WHEN** Agent reads `CLAUDE.md` for data writing instructions
- **THEN** the instruction directs Agent to use `scripts/db-write.mjs` as the primary path
- **AND** the TSV fallback is documented as a secondary option

### Requirement: migrateFromFiles covers initial data import
The existing `migrateFromFiles()` function in `server-db.ts` SHALL be sufficient to import historical data from `applications.md` and `reports/*.md` into SQLite before the new write path is used.

#### Scenario: Historical data is available in SQLite
- **WHEN** `migrateFromFiles()` has been executed at least once
- **THEN** all applications and reports from Markdown files are present in the SQLite database
- **AND** Go TUI and Next.js frontend can read them without parsing Markdown
