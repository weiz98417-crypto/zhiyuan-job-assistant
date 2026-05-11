## ADDED Requirements

### Requirement: Score range validation
The system SHALL validate that LLM-generated scores fall within the range 1.0 to 5.0 inclusive before persisting to any data store.

#### Scenario: Valid score passes validation
- **WHEN** `scripts/validate-output.mjs` receives an `overall_score` of `3.8`
- **THEN** the script exits with code 0 and outputs `{"score":{"valid":true}}`

#### Scenario: Out-of-range score is rejected
- **WHEN** `scripts/validate-output.mjs` receives an `overall_score` of `6.2` or `0.3`
- **THEN** the script exits with code 1
- **AND** outputs error: `score must be between 1.0 and 5.0, got <value>`
- **AND** Agent SHALL regenerate the score

#### Scenario: Non-numeric score is rejected
- **WHEN** `scripts/validate-output.mjs` receives an `overall_score` of `"4.2.1"` (malformed) or `"four"` (text)
- **THEN** the script exits with code 1
- **AND** Agent SHALL regenerate the score

### Requirement: Date format validation
The system SHALL validate that dates match `YYYY-MM-DD` format and are valid calendar dates.

#### Scenario: Valid date passes
- **WHEN** `validate-output.mjs` receives a `date` of `2026-05-08`
- **THEN** the script exits with code 0

#### Scenario: Invalid date is rejected
- **WHEN** `validate-output.mjs` receives a `date` of `2026-13-01` or `20260508` or `May 8, 2026`
- **THEN** the script exits with code 1
- **AND** outputs error describing the expected format

### Requirement: Status canonicalization
The system SHALL check that status values match canonical labels defined in `templates/states.yml` and auto-correct known aliases.

#### Scenario: Canonical status passes
- **WHEN** `validate-output.mjs` receives `status: "Applied"`
- **THEN** the script exits with code 0 and `status` remains `"Applied"`

#### Scenario: Known alias is auto-corrected
- **WHEN** `validate-output.mjs` receives `status: "已投递"`
- **THEN** the script maps it to `"Applied"` (the canonical label for alias `已投递` in states.yml)
- **AND** outputs a warning: `status "已投递" auto-corrected to "Applied"`

#### Scenario: Unknown status is rejected
- **WHEN** `validate-output.mjs` receives `status: "Pending Review"`
- **THEN** the script exits with code 1
- **AND** outputs error: `unknown status "Pending Review", valid values: [Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP]`

### Requirement: Report path format validation
The system SHALL validate that report paths match the canonical format.

#### Scenario: Correct path passes
- **WHEN** `validate-output.mjs` receives `report_path: "reports/042-bytedance-2026-05-08.md"`
- **THEN** the script exits with code 0

#### Scenario: Malformed path is rejected
- **WHEN** `validate-output.mjs` receives `report_path: "output/report.md"` or `"/dev/null"`
- **THEN** the script exits with code 1

### Requirement: Validation runs before any data persistence
The evaluation mode (jianzhi.md / oferta.md) SHALL instruct Agent to run `validate-output.mjs` after generating the report content but before calling `db-write.mjs`.

#### Scenario: Validation gates persistence
- **WHEN** Agent completes report generation
- **THEN** Agent calls `validate-output.mjs` with the structured output
- **AND** only proceeds to `db-write.mjs` if validation passes
- **AND** if validation fails, Agent retries report generation with corrected fields
