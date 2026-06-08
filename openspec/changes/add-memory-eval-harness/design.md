# Design: add-memory-eval-harness

## Context

The current memory MVP writes excellent resumes, chunks them, embeds them, extracts candidate patterns, retrieves snippets during resume optimization, and records feedback. That is enough for a demo, but not enough for a learning system. The next engineering step is a harness that catches regressions and proves the memory loop improves a narrow user workflow.

## Evaluation Wedge

Start with one role category: `AI Product Manager`.

Primary flow:

1. Save 5-10 excellent AI Product Manager resumes.
2. Optimize a user's project-experience section against an AI Product Manager JD.
3. Verify that retrieved examples are role-relevant, private/team scoped correctly, and used as guidance rather than copied.
4. Compare output quality with and without excellent-resume memory.
5. Accept or reject the generated variant and verify future retrieval ranking changes.

This wedge is narrow enough to debug but valuable enough to prove the product idea.

## Eval Types

### Baseline Evals

- Save excellent resume from pasted text.
- Save excellent resume from screenshot-extracted text using mocked OCR output.
- Ask one follow-up when role category is missing.
- Retrieve role-relevant snippets for resume optimization.
- Generate optimization output with source labels.

### Boundary Evals

- Unrelated image or non-resume text must not be saved as an excellent resume.
- JD or offer screenshot must not be routed into excellent-resume save flow.
- Private reference resumes must not be visible to other users.
- Team references must be retrievable only after approval and redaction.
- Raw excellent-resume snippets must not be injected into JD or offer evaluation.
- Optimized output must not copy long source phrases verbatim.

### Regression Evals

- Accepted references are upweighted for similar future optimization tasks.
- Rejected references are downweighted without disabling the whole resume.
- Candidate patterns with poor evidence are not retrieved as active guidance.
- Embedding provider failure does not block saving or later reindex.

## Metrics

- `retrieval_hit_at_k`: expected reference appears in top-k.
- `policy_violation_count`: cross-user, wrong-agent, or wrong-source retrieval incidents.
- `copy_overlap_score`: normalized overlap between output and reference snippets.
- `quality_delta`: judge score difference between no-memory and memory-enabled output.
- `feedback_rerank_delta`: ranking movement after accepted or rejected feedback.

## Runner Modes

### Deterministic Mode

Uses mock embeddings and fixed LLM fixtures. This runs in normal tests and CI.

### Provider Smoke Mode

Uses the configured embedding provider against a tiny Chinese phrase to verify dimensions and provider availability. This is opt-in and must never print secrets.

### Manual Golden Mode

Runs selected real examples and writes a readable markdown report for product review. This is not a blocking CI check until the golden set is stable.

## Risks / Trade-offs

- LLM quality judging can be noisy. Mitigate by separating deterministic structural checks from optional judge scoring.
- A too-large eval set will slow development. Start with the AI PM wedge and expand only after failures become actionable.
- Good memory can still produce bad copy. Keep retrieval metrics separate from output quality metrics.

## Implementation Notes

- Prefer small fixture files with redacted sample resumes and JDs.
- Keep provider smoke tests separate from `npm test`.
- Store eval reports under a generated or ignored location unless the report is intentionally committed as a golden artifact.
