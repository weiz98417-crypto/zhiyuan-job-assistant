# Design: add-memory-feedback-promotion

## Context

Excellent-resume pattern extraction currently creates candidate memory. That is the right default because extraction can be noisy. The missing layer is a promotion system that decides when a candidate has enough evidence to become active guidance, and when active guidance should be downranked or deprecated.

## Status Model

Memory items should use explicit statuses:

- `candidate`: extracted but not trusted enough for default retrieval.
- `active`: allowed to influence eligible agent prompts.
- `rejected`: reviewed or evaluated as not useful; excluded from retrieval.
- `disabled`: manually turned off; excluded from retrieval.
- `deprecated`: once useful but no longer recommended; heavily downranked or excluded depending on task.

Existing status values should be reused if they already cover these meanings.

## Promotion Signals

Candidate memory can be promoted only when enough positive signals exist:

- high-quality source evidence
- role and task match
- repeated retrieval in successful optimization contexts
- accepted or saved optimization outputs
- low copy-overlap risk
- no privacy or policy violation
- optional admin approval for team-shared memory

Default rule should be conservative:

- private memory may become active after repeated positive user feedback
- team-shared memory requires admin approval before active shared retrieval
- one accepted result can increase ranking but should not promote by itself

## Demotion Signals

Memory should be downranked, rejected, disabled, or deprecated when:

- users reject outputs that relied on it
- users heavily edit generated variants away from its pattern
- evals flag no-copy, policy, or quality failures
- evidence is weak, generic, incomplete, or unrelated
- role category conflicts with observed usage
- embedding/source metadata becomes stale

## Feedback Granularity

Feedback must be attributable:

- optimized output id or request id
- source reference resume id
- source chunk ids
- pattern memory ids
- user action: accepted, saved, rejected, dismissed, heavily edited
- optional textual feedback
- task type, role category, JD id, resume section

This allows reranking to improve without falsely marking the entire reference resume as bad.

## Retrieval Impact

Reranking should combine:

- semantic similarity
- role match
- source quality
- memory status
- confidence
- importance
- recency
- positive/negative usage feedback
- policy eligibility

Feedback should adjust ranking within a comparable task and role context, not globally.

## Risks / Trade-offs

- Aggressive promotion can contaminate output. Start conservative.
- Too much manual review can slow learning. Private memory can use user feedback faster than team-shared memory.
- Feedback can be ambiguous. Treat dismissal as weak negative and explicit rejection or heavy edit as stronger negative.
