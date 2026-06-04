## 1. Memory Schema

- [x] 1.1 Add `memory_items` with status, confidence, importance, source count, and metadata.
- [x] 1.2 Add `memory_evidence` with source type, source id, quote, extraction method, and confidence.
- [x] 1.3 Add `memory_chunks` with source type, source id, chunk text, embedding model, embedding, and metadata.
- [x] 1.4 Add indexes for user, source type, status, and recency.

## 2. Chunking And Embedding

- [x] 2.1 Define chunking rules for CVs, reference resumes, JDs, JD reports, offers, interviews, sessions, and stories.
- [x] 2.2 Add embedding model configuration and dimension validation.
- [x] 2.3 Add retryable embedding generation with failure reasons.
- [x] 2.4 Add a backfill command for existing source records.

## 3. Retrieval

- [x] 3.1 Add scoped retrieval by `user_id`.
- [x] 3.2 Add source-type filters for JD, offer, resume, interview, report, and profile memory.
- [x] 3.3 Add reranking using similarity, recency, confidence, importance, and source type.
- [x] 3.4 Return compact context snippets suitable for agent prompts.

## 4. Tests

- [x] 4.1 Add schema tests for memory tables.
- [x] 4.2 Add deterministic mock embedding tests.
- [x] 4.3 Test retrieval cannot cross user boundaries.
- [x] 4.4 Test embedding failures do not block source record writes.
- [x] 4.5 Validate this OpenSpec change.
