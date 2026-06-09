# Design: harden-profile-signal-quality-gate

## Context

Observed profile entries include incomplete phrases, generic words, duplicates, and content unrelated to user capability. This creates a false career profile and will damage agent retrieval once memory becomes durable.

## Goals / Non-Goals

**Goals:**

- Stop low-value fragments from becoming durable profile skills.
- Store candidate signals separately from confirmed profile facts.
- Bind every profile signal to evidence.
- Support user confirmation and deletion.

**Non-Goals:**

- Do not invent a full ontology for every possible career path.
- Do not require user confirmation for every low-risk signal before it can be used as weak context.
- Do not rewrite all profile UI at once.

## Decisions

- Use a quality pipeline: extract -> normalize -> validate -> dedupe -> score -> candidate/confirmed.
- Reject standalone generic nouns and incomplete phrases by rule before model scoring.
- Use source weighting: resume and user-confirmed preferences rank higher than ordinary chat; JD requirements do not become user skills unless matched to resume or user answer.
- Preserve rejected candidates for debugging only when useful; do not show them as profile skills.
- Show pending candidates separately from confirmed skills.

## Risks / Trade-offs

- Over-filtering may lose useful weak signals -> mitigate with candidate storage and review UI.
- Model extraction can still produce malformed JSON -> mitigate with schema validation and deterministic post-filters.
- Dedupe can merge distinct skills -> mitigate by keeping evidence lists and allowing manual edit.

## Migration Plan

1. Add validators and stopword/generic phrase filters.
2. Route new extraction into candidate memory.
3. Backfill cleanup for existing low-quality entries.
4. Update profile UI to distinguish confirmed and candidate signals.
5. Add regression tests using the bad examples observed in testing.
