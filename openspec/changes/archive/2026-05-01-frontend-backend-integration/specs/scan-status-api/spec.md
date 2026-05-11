## ADDED Requirements

### Requirement: Surface CLI scan results via API
The system SHALL read scan result files from the project root and return structured scan status data as JSON.

#### Scenario: Read scan sources from portals.yml
- **WHEN** `portals.yml` or `templates/portals.example.yml` exists at project root
- **THEN** `sources` array contains each company's name, platform, enabled status, and careers URL

#### Scenario: Read pipeline entries
- **WHEN** `data/pipeline.md` exists and contains unchecked entries
- **THEN** `results` array contains entries with status "new" for unchecked items

#### Scenario: Read scan history
- **WHEN** `data/scan-history.tsv` exists
- **THEN** `history` array contains dated records with resultsFound and newCount

#### Scenario: No scan data exists
- **WHEN** none of the scan output files exist (fresh setup)
- **THEN** system returns `{ success: true, data: { lastScanDate: null, sources: [], results: [], history: [] } }`

### Requirement: Cross-reference with applications
The system SHALL mark pipeline entries as "evaluated" when a matching application exists in `data/applications.md`.

#### Scenario: Pipeline entry already evaluated
- **WHEN** pipeline entry URL matches a report URL in applications.md
- **THEN** entry status is "evaluated" instead of "new"

### Requirement: Read-only — no scan execution
This endpoint SHALL only read existing files. It SHALL NOT trigger `scan.mjs` or any write operations.

#### Scenario: GET request returns data
- **WHEN** a GET request is made to `/api/scan/status`
- **THEN** system reads files and returns JSON without modifying any files
