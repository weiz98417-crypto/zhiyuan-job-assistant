# Spec Delta: Reference Resume Library

## ADDED Requirements

### Requirement: Snippet-level feedback learning

The reference resume library SHALL learn from optimization feedback at the snippet and pattern level rather than treating a whole reference resume as globally good or bad.

#### Scenario: Accepted snippet

- **WHEN** an optimization result that used reference resume chunks is accepted or saved
- **THEN** positive usage SHALL be recorded for the specific chunks and pattern memories used
- **AND** future similar retrieval SHALL increase their score within role, quality, and policy constraints

#### Scenario: Rejected snippet

- **WHEN** an optimization result that used reference resume chunks is rejected, dismissed, or heavily edited
- **THEN** negative usage SHALL be recorded for the specific chunks and pattern memories used
- **AND** the full reference resume SHALL remain available unless separate quality or policy rules disable it
