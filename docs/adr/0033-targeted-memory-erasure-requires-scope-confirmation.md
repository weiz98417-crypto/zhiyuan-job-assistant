# 0033 - Targeted memory erasure requires scope confirmation

Date: 2026-09-24

## Status

Accepted

## Context

The fact ledger in ADR-0028 retains invalidated facts and source episodes so later evidence can be understood. Its write-pipeline `DELETE` decision only invalidates a fact. The existing admin `delete_memory` action removes a legacy `memory_items` row but can leave independent vector chunks and copies in the newer ledger, profile, session summaries, or caches. Neither behavior satisfies a user's request to remove a specific memory. A statement such as “我忘记了曾在某公司工作” is also not an instruction to the assistant.

## Decision

1. Only a current, explicit user action in conversation or the memory-management page can start targeted memory erasure. Resolve the exact memory and show the user the matched content and scope. Ambiguous targets require clarification. Erasure begins only after the user confirms that scope; narrative, quotation, hypothetical text, source documents, and inferred preferences cannot authorize it.
2. On confirmation, immediately exclude the target from personalized retrieval and new memory writes. Remove the matching current and historical facts, their evidence and source-episode content, embeddings and search chunks, related structured profile blocks, session observations or reflections, summaries, and caches that contain or derive from the target. Redact a shared episode or summary, or rebuild it from allowed sources, without deleting unrelated facts. Completion requires read-back across the affected memory stores; an incomplete purge remains visible as pending or failed.
3. Preserve original conversations, resumes, reports, and other business records unless the user separately requests their deletion. Show this boundary in the confirmation and completion messages. Retained source material must not silently recreate the erased memory; record a content-free suppression reference to its source and target for the memory write pipeline. An explicit later request to remember the fact again can lift that suppression.
4. Keep only minimal audit metadata needed to establish who requested the operation, its scope identifiers, status, and time. Do not retain the erased text in the audit trail. Set a target maximum production backup retention of 30 days, subject to a read-only audit of the actual production policy before release. A restore must replay completed erasures before memory reads or extraction resume, and user-facing confirmation must not imply immediate physical removal from existing backups.
5. Until the cross-layer erasure flow and read-back are available, the legacy admin `delete_memory` action must reject a request for complete memory erasure with an explicit unavailable result. Archive and reject remain separate moderation actions and must not be presented as erasure.

## Consequences

Fact invalidation, preference correction, and targeted erasure remain distinct operations. Implementations must cover legacy Postgres memory, the M5 ledger, the Mastra session layer, and any client cache still in use. A deletion API that only removes `memory_items`, or marks `memory_facts.invalid_at`, cannot report success. Source records can still contain the information and may be read for a separate user-requested task; the product must state this clearly rather than promise that every copy of the information is gone.
