# Spec Delta: Verified Write Tools

## ADDED Requirements

### Requirement: High-risk tools use verified action protocol

Tools that mutate durable user data SHALL validate preconditions, apply changes transactionally, read back state, validate postconditions, and return evidence.

#### Scenario: Tool precheck blocks unsafe content

- **WHEN** an agent write tool receives placeholder text, markdown instructions, incomplete content, a modification table, or content for the wrong target section
- **THEN** the tool SHALL reject the write before touching storage
- **AND** return a recoverable explanation or clarification request

#### Scenario: Tool read-back verification

- **WHEN** a high-risk tool writes to storage
- **THEN** it SHALL read the target record back after writing
- **AND** verify that the target field matches the intended change and passes validators
- **AND** return `success: true` only if verification passes

#### Scenario: Tool write conflict

- **WHEN** the target base version or hash no longer matches the proposal base
- **THEN** the tool SHALL refuse to overwrite silently
- **AND** ask the user to review a fresh diff

### Requirement: Draft approval for document edits

Agent-initiated document edits SHALL be draft-first unless the user is making a direct manual edit outside the agent.

#### Scenario: Resume proposal created

- **WHEN** an agent wants to modify a resume section
- **THEN** it SHALL create a proposal containing section id, current base hash, proposed content, reason, and risk flags
- **AND** the UI SHALL show a diff before applying

#### Scenario: User approves proposal

- **WHEN** the user approves a proposal
- **THEN** the system SHALL apply it transactionally
- **AND** create a version snapshot
- **AND** verify read-back before reporting success

#### Scenario: User rejects proposal

- **WHEN** the user rejects or discards a proposal
- **THEN** no durable document field SHALL change
- **AND** the run SHALL record the rejection without treating it as a failure

### Requirement: Success claims gated by verifier

Assistant messages SHALL NOT claim durable success unless the runtime received verified action evidence.

#### Scenario: Model says saved but tool failed

- **WHEN** the model text claims a document was saved but the verified tool result failed or did not run
- **THEN** the system SHALL rewrite or block that success claim
- **AND** explain that no durable write occurred

#### Scenario: Tool result missing evidence

- **WHEN** a high-risk tool returns `success: true` without required verifier evidence
- **THEN** the runtime SHALL treat it as an invalid tool result
- **AND** mark the run as failed or verifying rather than succeeded

### Requirement: Rollback support

Document and record writes SHALL have a rollback path.

#### Scenario: Latest resume edit rollback

- **WHEN** a verified resume edit is applied
- **THEN** the previous version SHALL remain available
- **AND** the user or repair policy SHALL be able to restore it if the edit is later judged wrong

#### Scenario: Partial write detected

- **WHEN** a multi-step write partially succeeds
- **THEN** the repair policy SHALL either rollback completed steps or mark the affected records for review
- **AND** the UI SHALL show that the operation did not fully complete
