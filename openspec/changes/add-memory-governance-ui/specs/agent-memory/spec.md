# Spec Delta: Agent Memory

## ADDED Requirements

### Requirement: Admin-only memory governance visibility

The system SHALL let admins inspect durable memory items, their evidence, status, usage, and retrieval health while hiding memory internals from normal users.

#### Scenario: Normal user cannot inspect memory internals

- **WHEN** a normal user opens any reference material or profile surface
- **THEN** the system SHALL NOT show memory items, vector chunks, embeddings, candidate/active promotion state, rerank factors, or evidence chains
- **AND** the user surface SHALL only expose product-level material status and sharing consent controls

#### Scenario: Admin reviews candidate memory

- **WHEN** an admin opens the memory governance console
- **THEN** candidate memory SHALL be filterable by memory type, role category, source type, owner, confidence, and status
- **AND** each candidate SHALL show source evidence before an approval or rejection action is available

#### Scenario: Disable unsafe memory

- **WHEN** an admin disables a memory item
- **THEN** the item SHALL stop participating in retrieval
- **AND** historical usage records SHALL remain available for audit
- **AND** the UI SHALL show the disabled state and actor metadata when available
