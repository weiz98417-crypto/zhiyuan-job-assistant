# Spec Delta: Reference Resume Library

## ADDED Requirements

### Requirement: Reference resume governance

The reference resume library SHALL provide lightweight user controls for saved materials and admin controls for shared references, embedding health, and usage evidence.

#### Scenario: User manages own saved materials

- **WHEN** a user views their reference resume library
- **THEN** each reference SHALL show product-level fields such as name, role category, source, visibility, and simple processing or sharing status
- **AND** the user SHALL be able to rename, tag, disable, delete, request team sharing, or withdraw a sharing request
- **AND** the view SHALL NOT expose chunks, embeddings, candidate memory, rerank internals, or evidence chains

#### Scenario: Admin approves team reference

- **WHEN** a reference resume is requested for team sharing
- **THEN** it SHALL remain unavailable for shared retrieval until an admin approves it
- **AND** the admin review view SHALL show redaction status, source evidence, quality score, owner, and role category

#### Scenario: Reindex failed chunks

- **WHEN** a reference resume has failed or stale embedding chunks
- **THEN** an admin SHALL be able to trigger reindex
- **AND** the system SHALL show last failure reason, retry count, embedding model, and dimension
