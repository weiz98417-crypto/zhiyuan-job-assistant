# Change: add-vector-long-term-memory-store

## Why

Agents need durable semantic recall across resumes, JDs, reports, offers, interview answers, and profile evidence. PostgreSQL stores facts; pgvector should provide scoped semantic retrieval over those facts.

## What Changes

- Add long-term memory tables for canonical memory items, evidence, and embedded chunks.
- Add chunking and embedding jobs for approved source types.
- Add scoped semantic retrieval APIs with user filtering and reranking.
- Store embedding model and dimension metadata.
- Add retryable failure handling for embedding generation.

## Capabilities

### New Capabilities

- `vector-long-term-memory`: pgvector-backed memory item storage, embedding, and semantic retrieval.

### Modified Capabilities

- None.

## Impact

- Affected areas: PostgreSQL schema, background/job scripts or API actions, agent context APIs, profile/report/JD/offer/interview persistence hooks.
- Depends on `cutover-server-data-to-postgres`.
- Does not yet wire every agent to use memory; that is a later change.
