# Memory Evals

The memory eval harness proves that long-term memory improves a narrow workflow before the system expands memory usage across more agents.

## Blocking Deterministic Eval

Run this before applying memory retrieval, ranking, or policy changes:

```bash
npm run eval:memory
```

This uses local fixtures and deterministic keyword embeddings. It does not call a live model, PostgreSQL, pgvector, OCR, or an embedding provider.

It checks:

- AI Product Manager excellent-resume fixtures
- reference retrieval hit-at-k
- user isolation for private references
- approved-team-only shared references
- JD and offer task raw-reference denial
- no-copy overlap
- accepted/rejected feedback reranking
- failed embedding reindex state

## Provider Smoke Check

Run this manually when configuring Bailian or another OpenAI-compatible embedding provider:

```bash
npm run smoke:embedding
```

This command is opt-in and reads local/deployment secrets. It verifies provider availability and vector dimension, but it must not print API keys, authorization headers, or request secrets.

## Manual Golden Review

For product review, compare a no-memory resume optimization output against a memory-enabled output for one role category first:

1. AI Product Manager
2. Current resume project section
3. AI Product Manager JD
4. 5-10 redacted excellent resumes

Do not expand the golden set until failures are actionable.
