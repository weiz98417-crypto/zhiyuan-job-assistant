## ADDED Requirements

### Requirement: Liveness signal classification
The system SHALL provide a pure TypeScript function that classifies job posting liveness by scanning page content for closed/expired signals, matching the algorithm in `liveness-core.mjs`.

#### Scenario: Active posting detected
- **WHEN** page text contains "Apply" button text AND job description content, with no expired signals
- **THEN** function returns `{ tier: "active", confidence: "high" }`

#### Scenario: Expired posting detected
- **WHEN** page text contains signals like "This position has been filled", "No longer accepting applications", or "已招到"
- **THEN** function returns `{ tier: "expired", confidence: "high" }`

#### Scenario: Generic page (no JD content)
- **WHEN** page text consists only of navigation/footer without job description content
- **THEN** function returns `{ tier: "expired", confidence: "medium", reason: "Page appears to be a generic listing page without JD content" }`

#### Scenario: Ambiguous content
- **WHEN** both "Apply" and expired signals are absent
- **THEN** function returns `{ tier: "uncertain", confidence: "low" }`
