# Spec Delta: Offer Evaluation Model

## ADDED Requirements

### Requirement: China-specific single-offer evaluation

The system SHALL support evaluating one offer independently using China-specific compensation, contract, welfare, workload, and career-risk dimensions.

#### Scenario: Evaluate one offer before comparison

- **WHEN** the user asks whether a single offer is worth accepting
- **THEN** the system SHALL produce a single-offer evaluation
- **AND** the evaluation SHALL NOT require a second offer
- **AND** the result SHALL be saveable as an offer report

#### Scenario: China-specific modules are included

- **WHEN** an offer evaluation is generated
- **THEN** it SHALL include modules for cash compensation, take-home assumptions, social insurance, housing fund, contract/employment form, probation, overtime/rest, bonus/equity certainty, city cost, growth value, company/team stability, red flags, missing information, and verdict
- **AND** each module SHALL include score, confidence, evidence, and risks where applicable

### Requirement: Missing information becomes structured follow-up

The system SHALL convert incomplete offer facts into structured missing-information items instead of hiding uncertainty in prose.

#### Scenario: Offer lacks social insurance base

- **WHEN** the offer does not specify social insurance or housing fund base
- **THEN** the evaluation SHALL include a missing-information item for contribution base
- **AND** it SHALL mark take-home estimates as lower confidence
- **AND** it SHALL expose the item for later HR question generation

#### Scenario: Offer lacks bonus guarantee wording

- **WHEN** the offer includes annual bonus or commission without guarantee wording
- **THEN** the evaluation SHALL classify the bonus as uncertain
- **AND** it SHALL distinguish guaranteed pay from optimistic total package

### Requirement: Verdict uses score and risk together

The final recommendation SHALL combine score, risk flags, missing information, and user priorities rather than relying on headline compensation alone.

#### Scenario: High pay but high contract risk

- **WHEN** an offer has high cash compensation but severe outsourcing, non-compete, or overtime risk
- **THEN** the verdict SHALL reflect the risk
- **AND** it MAY recommend negotiation or caution instead of unconditional acceptance

