# 0028 - Memory splits into a Mastra session layer and a self-built Postgres fact ledger

Date: 2026-09-24

## Status

Accepted

## Context

The memory subsystem grew four uncoordinated stores (Postgres/pgvector items, Dexie client memory, localStorage episodic/semantic, session digests), writes with unconditional inserts and no conflict resolution, pure sequential-scan vector retrieval with no ANN index or hybrid search, and an admin UI that can approve or reject but not edit memory text. The product pains are concrete: contradictory or stale memories the agent quotes, poor retrieval relevance, and miscalibrated writes (things that should be remembered are not, noise is). Research across Mem0, Graphiti/Zep, Letta, MemOS, Memobase, Supermemory, and pi found no library that is simultaneously TypeScript-native, Postgres-backed, self-hostable with a clean license, and supportive of per-partition permissions with human governance — the per-task memory policy and governance UI already in this repo have no open-source equivalent.

## Decision

Memory becomes two deliberately layered subsystems instead of one engine or another parallel store:

1. **Session layer: adopt Mastra Memory directly** (`@mastra/core` memory + `@mastra/pg`), mapping resource to the user and thread to the Conversation. Working-memory blocks, semantic recall, and observational memory (observations/reflections) come from the library instead of being rebuilt; this also retires the localStorage episodic/semantic line.
2. **Long-term layer: self-built on Postgres.** A bi-temporal fact ledger (append-only episodes, entities with evolving summaries, facts carrying `valid_at`/`invalid_at`/`source_episode_id`) where contradiction invalidates rather than overwrites; a structured job-seeking profile as typed topic/sub-topic fields queried by SQL without embeddings; partition-based permissions (named memory partitions with explicit readable/writable lists) replacing task-type policy rules; admin gains text editing and full lifecycle views.
3. **Write pipeline:** deterministic completion events (evaluation finished, resume saved) write evidence-backed facts immediately; conversational signals flush in the background on idle or token thresholds; extraction upgrades from regex to the Mem0 two-stage decision (extract candidates, compare against similar existing facts, output ADD/UPDATE/DELETE/NOOP with recorded reasons).
4. **Retrieval:** HNSW index plus hybrid search (vector, BM25, entity links) feeding the existing five-factor reranker. The two layers connect in one direction: session observations may promote into candidate facts through the write decision, never directly.

## Consequences

Adopting Mastra adds a dependency and requires its resource/thread abstractions to map cleanly onto Conversation and Agent Run — this mapping is the first M5 verification point, with full self-build retained as fallback. What we avoid is the worse trade: full Mastra adoption would leave the contradiction/staleness pain (its worst form) unsolved because it has no fact ledger, permissions, or governance, while duplicating Mastra tables beside custom ones would recreate the four-store disease in new form. The admin governance surface, previously an orphan, becomes the human window onto the ledger's full lifecycle.
