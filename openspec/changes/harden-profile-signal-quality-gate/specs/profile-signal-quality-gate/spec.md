# Spec Delta: Profile Signal Quality Gate

## ADDED Requirements

### Requirement: Profile signals require evidence

The system SHALL require evidence before a profile signal can appear as a confirmed career-profile fact.

#### Scenario: Signal extracted from resume

- **WHEN** a skill or experience is extracted from a resume
- **THEN** the system SHALL store the source quote and source identifier
- **AND** the profile UI SHALL be able to show evidence for that signal

### Requirement: Low-value fragments are rejected or quarantined

The profile signal pipeline SHALL reject or quarantine incomplete, generic, duplicated, or irrelevant fragments.

#### Scenario: Generic fragment extracted

- **WHEN** extraction emits fragments such as "业务", "技术", "的技术方案", or incomplete requirement phrases
- **THEN** the system SHALL NOT display them as confirmed profile skills
- **AND** it SHALL either reject them or store them only as low-confidence candidates for debugging/review

### Requirement: JD requirements do not automatically become user skills

JD text SHALL not become a user profile skill unless supported by resume evidence, interview answer evidence, or explicit user confirmation.

#### Scenario: JD-only skill detected

- **WHEN** a JD mentions a required skill that is absent from the user's resume and user confirmations
- **THEN** the system SHALL treat it as a job requirement or skill gap
- **AND** it SHALL NOT add it as a confirmed user skill

### Requirement: Confirmed and inferred signals are separated

The system SHALL distinguish user-confirmed profile facts from model-inferred candidates.

#### Scenario: Candidate signal appears

- **WHEN** the model infers a useful but unconfirmed profile signal
- **THEN** the system SHALL store it with candidate status
- **AND** the main profile view SHALL not present it as equally reliable as confirmed user data
