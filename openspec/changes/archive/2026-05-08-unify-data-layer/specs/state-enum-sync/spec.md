## ADDED Requirements

### Requirement: states.yml is the single source of truth for application status
`templates/states.yml` SHALL be the only file that defines canonical application status values. All consumers SHALL derive valid statuses from this file rather than hardcoding them.

#### Scenario: New status added to states.yml propagates to consumers
- **WHEN** a new status is added to `templates/states.yml`
- **THEN** `validate-output.mjs` accepts it as valid without code changes
- **AND** Go TUI displays it in the status filter tabs after restart
- **AND** Agent accepts it as a valid status value when reading CLAUDE.md

### Requirement: CLAUDE.md references states.yml instead of hardcoding
CLAUDE.md SHALL replace its hardcoded status table (lines 220-229) with an instruction to read `templates/states.yml`.

#### Scenario: Agent discovers valid statuses
- **WHEN** Agent needs to validate or display an application status
- **THEN** Agent reads `templates/states.yml` to get the canonical list
- **AND** uses the `label` field for display and the `id` field for persistence

### Requirement: Go TUI loads status definitions from states.yml at startup
Go TUI dashboard SHALL parse `templates/states.yml` during initialization rather than using hardcoded filter groups.

#### Scenario: Dashboard displays correct filter tabs
- **WHEN** Go TUI starts
- **THEN** it reads `templates/states.yml` and creates filter tabs from `states[*].dashboard_group`
- **AND** each tab shows the canonical label from `states[*].label`
- **AND** status aliases are used for matching when parsing application data

### Requirement: merge-tracker.mjs hardcoded list is documented as frozen
The hardcoded `CANONICAL_STATES` array in `merge-tracker.mjs:40` SHALL remain as-is (script is deprecated) with a comment referencing `templates/states.yml` as the current authority.

#### Scenario: Developer reads merge-tracker.mjs
- **WHEN** a developer opens `merge-tracker.mjs`
- **THEN** the DEPRECATED notice at line 1-7 is visible
- **AND** a comment at line 40 directs them to `templates/states.yml` for the current list
