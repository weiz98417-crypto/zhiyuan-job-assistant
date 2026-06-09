# Spec Delta: Agent Long-Term Memory Integration

## ADDED Requirements

### Requirement: Agents assemble task-specific memory context

Agents SHALL retrieve long-term memory through a task-specific context assembler rather than free-form database access.

#### Scenario: JD evaluation context

- **WHEN** the Evaluate agent handles a JD evaluation
- **THEN** it SHALL retrieve structured resume/profile facts and relevant semantic memory scoped to that user
- **AND** it SHALL label retrieved context by source type

#### Scenario: Offer evaluation context

- **WHEN** the Offer agent handles offer evaluation
- **THEN** it SHALL retrieve compensation preferences, location constraints, prior offers, and relevant risk memory scoped to that user

### Requirement: Interview sessions remain grounded in bound sources

Interview coaching SHALL keep the selected JD and resume binding across turns.

#### Scenario: User asks for one-question-at-a-time interview

- **WHEN** an interview session starts with a JD and resume snapshot
- **THEN** every interview question SHALL use those bound snapshots unless the user explicitly changes them
- **AND** the agent SHALL not drift into generic questions after a format correction

### Requirement: Agent writeback creates candidate memory

Agents SHALL write new learnings as candidate memory with evidence rather than confirmed profile truth.

#### Scenario: Interview answer analyzed

- **WHEN** an interview answer reveals a likely strength or gap
- **THEN** the agent SHALL save it as candidate memory with answer evidence
- **AND** it SHALL NOT mark it as confirmed unless the user confirms or quality rules allow it

### Requirement: Agent memory retrieval is user-isolated

Agents SHALL never retrieve another user's private memory.

#### Scenario: Multiple users have similar JDs

- **WHEN** two users have similar resumes, JDs, or reports
- **THEN** semantic retrieval for one user SHALL return only records owned by that user
