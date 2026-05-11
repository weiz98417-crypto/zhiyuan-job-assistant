## ADDED Requirements

### Requirement: portals.yml scan_method field
`portals.yml` SHALL support a `scan_method` field for each company entry with values `api` or `playwright`.

#### Scenario: API-capable company
- **WHEN** `portals.yml` has a company with `scan_method: api`
- **THEN** `scan.mjs` attempts API-based scanning
- **AND** if API fails, it logs the error and skips (does NOT fall back to Playwright)

#### Scenario: Playwright-only company
- **WHEN** `portals.yml` has a company with `scan_method: playwright`
- **THEN** `scan.mjs` skips this company entirely
- **AND** outputs: `SKIPPED {name}: requires Playwright — process via pipeline mode`

#### Scenario: Missing scan_method field
- **WHEN** `portals.yml` has a company without `scan_method`
- **THEN** `scan.mjs` attempts `detectApi()` as before
- **AND** if API is detected, scans it; otherwise skips with "no API detected"

### Requirement: scan.mjs documents platform coverage
The top of `scan.mjs` SHALL include a comment block listing supported ATS platforms and their status.

#### Scenario: Developer reads scan.mjs
- **WHEN** a developer opens `scan.mjs`
- **THEN** the header comment includes:
  - Supported: Greenhouse, Ashby, Lever
  - Not supported (requires Playwright): Boss直聘, 拉勾, 猎聘, LinkedIn, 51job, 智联招聘
  - `CONCURRENCY` is documented as applying only to HTTP API calls

### Requirement: scan.mjs CONCURRENCY value is documented
The `CONCURRENCY = 10` constant SHALL have an inline comment explaining its scope.

#### Scenario: Developer reads CONCURRENCY
- **WHEN** a developer sees `CONCURRENCY = 10` in scan.mjs
- **THEN** a comment explains: "Maximum concurrent HTTP API calls. Does NOT include Playwright — browser automation is always serial."
