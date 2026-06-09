# Tasks: add-memory-governance-ui

## 1. API Inventory And Access Control

- [x] 1.1 Audit existing memory and reference resume APIs for owner/admin authorization.
- [x] 1.2 Add list/detail endpoints for memory items, evidence, chunks, usage stats, and embedding health.
- [x] 1.3 Add admin endpoints for pending team references and candidate memory review.
- [x] 1.4 Add audit-safe actions for approve, reject, disable, restore, delete, and reindex.

## 2. Lightweight User Material Management

- [x] 2.1 Add user-facing saved excellent-resume material list with name, role, source, visibility, and simple processing/share status.
- [x] 2.2 Add material detail view that shows only user-understandable content and hides memory items, chunks, embeddings, rerank internals, and evidence chains.
- [x] 2.3 Add private/team sharing controls with explicit consent, withdraw-sharing action, and review status display.
- [x] 2.4 Add user actions for rename, tag edit, disable, and delete.

## 3. Admin Governance Console

- [x] 3.1 Add pending team-share review queue.
- [x] 3.2 Add failed/stale embedding health queue.
- [x] 3.3 Add candidate pattern review queue with source evidence.
- [x] 3.4 Add high-rejection or low-quality reference detection.
- [x] 3.5 Add bulk-safe filters by role category, source type, visibility, status, and owner.

## 4. Privacy And Evidence UX

- [x] 4.1 Redact or hide private raw text for unauthorized viewers.
- [x] 4.2 Show source evidence for every candidate or active memory item in admin views only.
- [x] 4.3 Show why a reference was used in an optimization result in admin diagnostics only when usage metadata exists.
- [x] 4.4 Prefer disable over delete when memory has historical usage records.
- [x] 4.5 Ensure normal user views do not expose memory items, chunks, embeddings, promotion state, or rerank internals.

## 5. Tests

- [x] 5.1 Test user cannot view another user's private memories or chunks.
- [x] 5.2 Test non-admin cannot approve team-shared memory.
- [x] 5.3 Test admin can approve, reject, disable, and reindex eligible records.
- [x] 5.4 Test redacted shared views do not expose private raw text.
- [x] 5.5 Test normal user material views hide memory internals.
- [x] 5.6 Test admin UI renders empty, failed, pending, active, disabled, and rejected states.
- [x] 5.7 Run OpenSpec validation for this change.
