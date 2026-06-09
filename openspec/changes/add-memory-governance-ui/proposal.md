# Change: add-memory-governance-ui

## Why

Long-term memory needs operational visibility, but that visibility should not turn the normal user experience into a technical control panel. After MVP, memory records can be created by OCR, chat, resume saves, evaluations, and feedback. Admins need to inspect evidence, embedding failures, shared approvals, and bad memory. Normal users only need simple control over the materials they saved and whether those materials can be shared.

## What Changes

- Add an admin-only governance console for memory items, evidence, chunks, reference resumes, embedding status, and usage stats.
- Add lightweight user-facing reference material management for saved excellent resumes and sharing consent.
- Let admins review pending team-shared references, approve or reject shared memory, reindex failed chunks, disable bad memory, and inspect usage health.
- Add admin source attribution views so every durable memory can be traced back to evidence.

## Non-Goals

- Do not change the core retrieval algorithm in this change.
- Do not promote candidate memory automatically in this change.
- Do not expose private user memory to other LAN users.
- Do not expose memory items, vector chunks, embedding internals, rerank details, or candidate memory workflows to normal users.
- Do not make governance UI a general analytics dashboard.

## Capabilities

### Modified Capabilities

- `agent-memory`: add admin-only memory governance and evidence inspection requirements.
- `reference-resume-library`: add admin reference approval/reindex controls and lightweight user material-management requirements.

## Dependencies

- Depends on `excellent-resume-memory-evolution`.
- Should ideally follow `add-memory-eval-harness` so UI actions can be tested against known policy expectations.

## Impact

- Affected areas: admin APIs, minimal user reference APIs, CV/reference resume material list, admin memory pages, embedding reindex controls, tests.
- Product impact: turns long-term memory from an invisible black box into an inspectable asset.
