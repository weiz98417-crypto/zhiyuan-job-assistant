# Design: add-vector-long-term-memory-store

## Context

The project already has conceptual working, episodic, and semantic memory modules, but durable data is fragmented. This change creates the server-side memory substrate; later changes decide which agents consume it.

## Goals / Non-Goals

**Goals:**

- Store canonical memory items with status, confidence, importance, and metadata.
- Store evidence linking memory back to source text.
- Store embedded chunks for semantic retrieval.
- Restrict retrieval by `user_id` and source/task filters.

**Non-Goals:**

- Do not automatically trust every extracted phrase as profile truth.
- Do not require embeddings to succeed before saving source records.
- Do not decide final career-profile UI behavior.

## Decisions

- Separate `memory_items` from `memory_chunks`. Items represent durable facts or candidates; chunks represent searchable source text.
- Separate `memory_evidence` from both items and chunks so every high-value memory can point to original text.
- Store `embedding_model` and expected dimension. Mixed dimensions require separate columns/tables or a migration, not silent writes.
- Start with exact vector scan or simple index only; add HNSW after baseline query volume and latency are known.
- Retrieval must combine structured filters, vector similarity, recency, confidence, and source type.

## Risks / Trade-offs

- Embedding provider failures -> mitigate with retry status and non-blocking writes.
- Noisy retrieval -> mitigate with source filters and reranking.
- Dimension mismatch -> mitigate with startup validation and model metadata.

## Migration Plan

1. Add memory schema.
2. Add chunking/embedding utilities.
3. Backfill embeddings for current JDs, reports, CVs, offers, sessions, and stories in batches.
4. Add retrieval API for internal agent use.
5. Add tests with deterministic mock embeddings.

Rollback means disabling retrieval while keeping source records intact.
