## ADDED Requirements

### Requirement: Risk intel file with YAML schema
The system SHALL maintain `modes/zh/risk-intel.md` as a YAML knowledge base with five top-level keys: `terms`, `patterns`, `employment_types`, `company_risks`, `salary_benchmarks`.

#### Scenario: Black-market term dictionary
- **WHEN** `risk-intel.md` is loaded
- **THEN** `terms` contains entries with `{term, meaning, severity, category, false_positive_notes}`
- **AND** each term has a severity of `critical`, `high`, `medium`, or `low`

#### Scenario: Scam pattern library
- **WHEN** a new scam pattern is discovered
- **THEN** `patterns` accepts entries with `{pattern, description, signals[], severity, false_positive_notes}`

#### Scenario: Company risk lookup
- **WHEN** a company slug is extracted from a JD
- **THEN** `company_risks` entries with matching `company_slug` SHALL be returned

### Requirement: User-seeded initial data
The system SHALL require at least 5 combined entries across `terms` + `patterns` before risk detection activates.

#### Scenario: Cold start degradation
- **WHEN** total entries < 5
- **THEN** evaluation reports skip the risk module with "⚠️ 风险情报库尚未充分初始化，跳过风险检测"

#### Scenario: Growth phase
- **WHEN** 5 <= total entries < 30
- **THEN** risk detection runs normally but reports note "风险情报库持续建设中，当前覆盖率有限"

### Requirement: False positive feedback loop
The system SHALL support user feedback on false positives via `false_positive_notes` field.

#### Scenario: User flags a false positive
- **WHEN** user replies "误报: 扁平化管理 — 公司确实有成熟的扁平文化"
- **THEN** the signal is recorded in the term's `false_positive_notes`
- **AND** subsequent evaluations for the same company name auto-downgrade this signal to 🟢
