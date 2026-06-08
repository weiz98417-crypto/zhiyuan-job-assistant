# Change: add-memory-eval-harness

## Why

The MVP can store and retrieve long-term memory, but we do not yet have a reliable way to prove that memory improves output quality. Without evals, every later memory feature is guesswork: the system may retrieve irrelevant snippets, copy reference wording, leak across users, or silently stop using memory after unrelated agent changes.

## What Changes

- Add a repeatable memory eval harness for excellent-resume memory, role-scoped retrieval, and resume optimization.
- Define baseline, boundary, and regression eval fixtures for one narrow wedge first: AI Product Manager excellent resumes improving project-experience optimization.
- Track retrieval quality, policy violations, source attribution, no-copy behavior, and accept/reject reranking behavior.
- Add deterministic mock embedding and provider-backed smoke modes so local CI stays stable while manual provider checks remain possible.
- Produce concise eval reports that make memory changes reviewable before shipping.

## Non-Goals

- Do not build governance UI in this change.
- Do not change promotion rules for candidate memory in this change.
- Do not expand evals to every agent before the resume optimization wedge is measurable.
- Do not require a live embedding provider for normal unit tests.

## Capabilities

### Modified Capabilities

- `agent-memory`: add eval requirements for retrieval, isolation, source policy, and output improvement.
- `reference-resume-library`: add excellent-resume retrieval eval coverage.

## Dependencies

- Depends on `excellent-resume-memory-evolution`.
- Should land before `add-memory-governance-ui`, `add-memory-feedback-promotion`, and `harden-agent-memory-policy`.

## Impact

- Affected areas: test fixtures, eval runner scripts, mock embedding utilities, resume optimization tests, memory retrieval tests, CI commands.
- Product impact: gives us a concrete answer to "did long-term memory make this resume output better?"
