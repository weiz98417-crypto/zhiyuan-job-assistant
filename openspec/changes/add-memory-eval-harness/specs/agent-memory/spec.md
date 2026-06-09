# Spec Delta: Agent Memory

## ADDED Requirements

### Requirement: Memory eval harness

The system SHALL provide repeatable evals that prove long-term memory retrieval improves the intended workflow without violating source, user, or task boundaries.

#### Scenario: Resume optimization memory baseline

- **WHEN** the eval harness runs the AI Product Manager resume optimization baseline
- **THEN** it SHALL compare output generated with memory disabled against output generated with excellent-resume memory enabled
- **AND** it SHALL report retrieved source labels, pattern labels, and quality delta
- **AND** it SHALL keep the eval deterministic unless an explicit provider or judge mode is requested

#### Scenario: Memory boundary violations

- **WHEN** eval fixtures include private references from another user, pending team references, JD screenshots, offer screenshots, or unrelated images
- **THEN** the eval harness SHALL fail if those sources are retrieved by an unauthorized user or injected into the wrong agent task
- **AND** failures SHALL identify the violating source id, source type, user scope, and task type

#### Scenario: No-copy regression

- **WHEN** resume optimization uses excellent-resume snippets
- **THEN** the eval harness SHALL check that generated output transfers structure and framing rather than copying long source phrases verbatim
- **AND** the report SHALL include a copy-overlap score or explicit no-copy assertion

#### Scenario: Feedback reranking regression

- **WHEN** an optimization result is accepted or rejected in an eval fixture
- **THEN** future similar retrieval SHALL change ranking in the expected direction
- **AND** rejected feedback SHALL downrank the snippet without disabling the full reference resume
