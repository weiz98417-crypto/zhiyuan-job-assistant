# Change: add-memory-feedback-promotion

## Why

The MVP stores excellent-resume patterns as candidate memory and records accept/reject feedback, but it does not yet define a trustworthy learning rule. If every extracted pattern immediately affects future outputs, bad memories will accumulate. If feedback is recorded but never changes status or ranking, the system does not truly learn.

## What Changes

- Add a promotion workflow from candidate memory to active memory based on evidence, usage, feedback, and optional admin approval.
- Add demotion and rejection rules for bad, stale, conflicting, or repeatedly rejected memory.
- Track feedback at the level of reference snippet, pattern memory, optimized output, and user action.
- Add explainable reranking inputs so future retrieval can say why a memory was trusted.
- Keep automatic promotion conservative until eval evidence is strong.

## Non-Goals

- Do not build the full governance UI in this change.
- Do not let raw reference resume content become facts about the user.
- Do not auto-promote memories from a single accepted output unless explicitly configured.
- Do not make feedback global across roles without role and task similarity checks.

## Capabilities

### Modified Capabilities

- `agent-memory`: add candidate-to-active promotion, demotion, and feedback-based trust rules.
- `reference-resume-library`: add feedback aggregation and snippet-level learning requirements.

## Dependencies

- Depends on `excellent-resume-memory-evolution`.
- Should follow `add-memory-eval-harness`.
- Works best after or alongside `add-memory-governance-ui` if admin approval is required for team-shared active memory.

## Impact

- Affected areas: memory status transitions, reference resume usage records, optimization feedback APIs, retrieval reranking, tests and evals.
- Product impact: turns "stored memory" into a controlled learning loop.
