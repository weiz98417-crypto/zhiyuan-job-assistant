## 1. Memory Schema

- [ ] 1.1 Add `memory_items` with status, confidence, importance, source count, and metadata.
- [ ] 1.2 Add `memory_evidence` with source type, source id, quote, extraction method, and confidence.
- [ ] 1.3 Add `memory_chunks` with source type, source id, chunk text, embedding model, embedding, and metadata.
- [ ] 1.4 Add indexes for user, source type, status, and recency.

## 2. Chunking And Embedding

- [ ] 2.1 Define chunking rules for CVs, reference resumes, JDs, JD reports, offers, interviews, sessions, and stories.
- [ ] 2.2 Add embedding model configuration and dimension validation.
- [ ] 2.3 Add retryable embedding generation with failure reasons.
- [ ] 2.4 Add a backfill command for existing source records.

## 3. Retrieval

- [ ] 3.1 Add scoped retrieval by `user_id`.
- [ ] 3.2 Add source-type filters for JD, offer, resume, interview, report, and profile memory.
- [ ] 3.3 Add reranking using similarity, recency, confidence, importance, and source type.
- [ ] 3.4 Return compact context snippets suitable for agent prompts.

## 4. Tests

- [ ] 4.1 Add schema tests for memory tables.
- [ ] 4.2 Add deterministic mock embedding tests.
- [ ] 4.3 Test retrieval cannot cross user boundaries.
- [ ] 4.4 Test embedding failures do not block source record writes.
- [ ] 4.5 Validate this OpenSpec change.
