## ADDED Requirements

### Requirement: Follow-up cadence calculation
The system SHALL provide a pure TypeScript function that calculates follow-up urgency based on days since application, matching the algorithm in `followup-cadence.mjs`.

#### Scenario: Recent application
- **WHEN** days since application < 7
- **THEN** function returns `{ level: "等待中", urgency: "low", action: "暂无操作" }`

#### Scenario: Needs follow-up
- **WHEN** days since application is between 7 and 14
- **THEN** function returns `{ level: "待跟进", urgency: "medium", action: "可礼貌询问进展" }`

#### Scenario: Stale application
- **WHEN** days since application >= 30
- **THEN** function returns `{ level: "可能已凉", urgency: "high", action: "建议归档并继续投递" }`

### Requirement: Application funnel analysis
The system SHALL provide a pure TypeScript function that computes conversion rates between application status stages.

#### Scenario: Funnel computation
- **WHEN** given an array of Application objects with various statuses
- **THEN** function returns stage counts and conversion rates for evaluated→applied→responded→interview→offer

#### Scenario: Empty funnel
- **WHEN** given an empty array
- **THEN** function returns zero counts for all stages

### Requirement: Rejection pattern analysis
The system SHALL provide a pure TypeScript function that analyzes rejection patterns, correlating rejection reasons with archetypes and companies.

#### Scenario: Pattern detection
- **WHEN** given rejected applications with notes containing rejection reasons
- **THEN** function groups rejections by reason keyword and archetype, returning sorted frequency counts
