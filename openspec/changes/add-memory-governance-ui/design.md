# Design: add-memory-governance-ui

## Context

The product is moving from single-user local memory toward LAN-shared reference knowledge. That requires trust controls. A team-shared excellent resume must not become retrievable just because someone uploaded it; a candidate pattern must not influence outputs forever without evidence; and embedding failures must be actionable rather than hidden in logs.

## Product Surfaces

### Lightweight User Reference Materials

Normal users should not see memory internals. They can view and manage the excellent resume materials they saved:

- name, role category, visibility, status, quality score
- source type and import date
- simple processing state such as "已保存", "处理中", "共享审核中", "已共享", or "共享被拒绝"
- actions: rename, edit tags, request team sharing, withdraw sharing request, disable, delete

Do not show normal users:

- `memory_items`
- vector chunks
- raw embedding status or dimensions
- candidate/active promotion state
- rerank factors
- internal evidence chains
- system-level usage statistics

### Admin Memory Console

Admins can inspect memory and shared corpus health:

- pending team-share approvals
- redaction status and warnings
- failed embedding chunks
- stale embedding model/dimension records
- high-rejection references
- candidate patterns awaiting approval
- disabled or deprecated memory

Admin actions:

- approve/reject team-shared references
- approve/reject candidate memory
- disable or restore memory
- trigger reindex
- view evidence trail
- delete unsafe shared content when needed

## Data Model Expectations

This change should reuse existing tables where possible:

- `reference_resumes`
- `reference_resume_chunks`
- `reference_resume_usage`
- `memory_items`
- `memory_evidence`
- `memory_chunks`

Only add fields if current status, moderation, evidence, or usage metadata cannot support the UI.

## Access Rules

- A normal user can manage only their own saved reference materials and sharing consent.
- A normal user can see approved team references only as ordinary reference materials where the product intentionally exposes them.
- A normal user cannot see another user's private raw text, private evidence, or private chunks.
- A normal user cannot inspect memory items, chunks, embeddings, promotion status, rerank internals, or evidence trails.
- An admin can review team-share candidates and shared corpus health.
- Admin views must show enough evidence to make approval decisions.

## UI Principles

- This is an operations surface, not a marketing page.
- Admin console should prioritize dense, scannable tables with filters and detail drawers.
- Every admin memory row should answer: what is it, where did it come from, who can use it, is it healthy, and has it helped?
- User material management should stay simple: what did I save, is it private or shared, and can I remove or withdraw it?
- Destructive admin actions require confirmation and should prefer disable over delete when historical usage exists.

## Risks / Trade-offs

- Too much raw memory text in the UI can create privacy risk. Default to snippets and reveal raw text only when the viewer has permission.
- Admin tools can become dangerous. Prefer explicit role checks and audit logs for shared corpus actions.
- Reindex actions can hide provider failures if they are too quiet. Show last failure reason and retry count.
- Showing memory internals to users can reduce trust and create confusion. Keep the user surface focused on saved materials and consent.
