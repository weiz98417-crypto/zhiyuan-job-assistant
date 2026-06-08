# Spec Delta: Agent Memory

## ADDED Requirements

### Requirement: Memory promotion workflow

The system SHALL promote, demote, reject, disable, or deprecate long-term memory through explicit status transitions based on evidence, feedback, policy eligibility, and review rules.

#### Scenario: Candidate memory promotion

- **WHEN** candidate memory has sufficient positive feedback, strong evidence, task similarity, and no policy violations
- **THEN** the system MAY promote it to active memory according to configured transition rules
- **AND** team-shared active memory SHALL require admin approval before it becomes retrievable by other users

#### Scenario: Negative feedback demotion

- **WHEN** memory repeatedly contributes to rejected, dismissed, or heavily edited outputs
- **THEN** the system SHALL reduce its future retrieval score for similar tasks
- **AND** it MAY demote, reject, or deprecate the memory when negative evidence crosses configured thresholds

#### Scenario: Status transition audit

- **WHEN** memory status changes
- **THEN** the system SHALL record actor, reason, previous status, next status, and timestamp when available
- **AND** rejected, disabled, or ineligible memory SHALL NOT be injected into agent prompts

### Requirement: Feedback-attributed reranking

The system SHALL adjust future memory retrieval using feedback attributed to specific chunks, patterns, task types, and role categories.

#### Scenario: Positive feedback ranking

- **WHEN** a user accepts or saves an output that used specific memory sources
- **THEN** similar future tasks SHALL rank those sources higher within policy and quality limits
- **AND** the rank explanation SHALL identify feedback as one ranking input

#### Scenario: Negative feedback ranking

- **WHEN** a user rejects, dismisses, or heavily edits an output that used specific memory sources
- **THEN** similar future tasks SHALL rank those sources lower
- **AND** unrelated roles or task types SHALL NOT be strongly affected by that negative signal
