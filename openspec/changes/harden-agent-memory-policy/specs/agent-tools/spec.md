# Spec Delta: Agent Tools

## ADDED Requirements

### Requirement: Policy-aware memory tools

Agent tools that retrieve memory SHALL declare their task type and obey the centralized memory policy.

#### Scenario: Memory retrieval tool declares task

- **WHEN** an agent tool retrieves profile, JD, offer, resume, interview, or reference memory
- **THEN** the tool SHALL pass an explicit task type to the memory context assembler
- **AND** the assembler SHALL apply the matching policy before returning snippets

#### Scenario: Conflicting content fallback

- **WHEN** user text implies one task but uploaded or retrieved content implies a different task
- **THEN** the tool or agent SHALL ask a clarification question instead of retrieving memory for both tasks indiscriminately
- **AND** no disallowed raw memory SHALL be injected while waiting for clarification
