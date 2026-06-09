# Spec Delta: Vector Long-Term Memory

## ADDED Requirements

### Requirement: Memory records preserve source evidence

The memory store SHALL separate canonical memory items from source evidence and embedded chunks.

#### Scenario: Memory item created

- **WHEN** the system creates a durable or candidate memory item
- **THEN** it SHALL store memory type, canonical text, status, confidence, importance, metadata, and owner
- **AND** it SHALL be able to link the item to one or more evidence records

### Requirement: Embeddings are scoped and model-aware

Embedded chunks SHALL record their embedding model and remain scoped to the owning user.

#### Scenario: Chunk embedded

- **WHEN** a source chunk is embedded
- **THEN** the system SHALL store source type, source id, chunk text, embedding model, embedding vector, metadata, and user owner
- **AND** it SHALL reject or quarantine embeddings that do not match the configured dimension

### Requirement: Semantic retrieval is user-scoped

The semantic retrieval API SHALL return only memory owned by the requesting user.

#### Scenario: Retrieval request

- **WHEN** an agent requests semantic memory for a user task
- **THEN** retrieval SHALL filter by user before returning snippets
- **AND** it SHALL support source-type filters relevant to the task

### Requirement: Embedding failures do not block source persistence

Embedding generation SHALL be retryable and SHALL not prevent source facts from being saved.

#### Scenario: Embedding provider fails

- **WHEN** a JD, resume, report, offer, or interview source is saved but embedding generation fails
- **THEN** the source record SHALL remain saved
- **AND** the embedding job SHALL record a retryable failure reason
