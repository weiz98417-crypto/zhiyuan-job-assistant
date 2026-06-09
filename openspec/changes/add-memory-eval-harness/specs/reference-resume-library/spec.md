# Spec Delta: Reference Resume Library

## ADDED Requirements

### Requirement: Reference resume retrieval evals

The reference resume library SHALL expose enough deterministic behavior to evaluate excellent-resume save, indexing, retrieval, and feedback loops.

#### Scenario: Deterministic reference retrieval

- **WHEN** the eval harness seeds reference resumes with mock embeddings
- **THEN** retrieval SHALL return stable ranked snippets for the same role category, section type, user scope, and target JD
- **AND** the result SHALL include enough metadata to explain the ranking inputs

#### Scenario: Provider smoke check

- **WHEN** an operator runs the opt-in embedding provider smoke command
- **THEN** the system SHALL embed a short non-sensitive phrase
- **AND** it SHALL verify the configured vector dimension
- **AND** it SHALL NOT print API keys, request headers, or provider secrets
