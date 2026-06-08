# Spec Delta: Agent Memory

## ADDED Requirements

### Requirement: Enforceable agent memory policy

The system SHALL enforce task-specific memory source policies before any memory is injected into an agent prompt.

#### Scenario: Policy filters before prompt assembly

- **WHEN** an agent requests long-term memory for a task
- **THEN** the system SHALL filter candidate memory by task type, agent id, user scope, visibility, status, source type, memory type, and context budget before prompt assembly
- **AND** denied memory SHALL NOT be passed to the model
- **AND** every injected memory block SHALL include a source label

#### Scenario: Default deny for unknown task type

- **WHEN** the memory assembler receives an unknown or missing task type
- **THEN** it SHALL deny semantic memory retrieval by default
- **AND** the agent SHALL continue with explicit current-turn context or ask a clarification question

#### Scenario: Agent-specific raw reference restrictions

- **WHEN** JD evaluation, offer evaluation, interview coaching, or general chat runs
- **THEN** raw excellent-resume snippets SHALL NOT be injected by default
- **AND** resume optimization MAY receive raw excellent-resume snippets only when the policy explicitly allows them

#### Scenario: Denial trace

- **WHEN** memory is denied by policy
- **THEN** the system SHALL record a non-secret denial trace with task type, agent id, source type, source id, and denial reason
- **AND** private raw text SHALL NOT be written into the denial trace
