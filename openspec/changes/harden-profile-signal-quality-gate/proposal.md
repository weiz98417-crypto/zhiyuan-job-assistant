# Change: harden-profile-signal-quality-gate

## Why

The current career profile can accumulate low-value fragments such as partial phrases, generic words, duplicated snippets, and irrelevant conversation residue. Long-term memory will amplify this problem unless profile extraction has a quality gate.

## What Changes

- Introduce candidate profile signals before durable profile memory.
- Require evidence, source type, confidence, and quality checks for extracted skills/preferences/experiences.
- Reject generic or incomplete fragments.
- Deduplicate and normalize semantically equivalent profile signals.
- Separate user-confirmed facts from model-inferred candidates.
- Update profile display to hide or quarantine low-confidence candidates.

## Capabilities

### New Capabilities

- `profile-signal-quality-gate`: Evidence-backed profile signal extraction, filtering, normalization, and confirmation.

### Modified Capabilities

- None.

## Impact

- Affected areas: `profile-mining`, `profile-skill-quality`, `profile-update`, profile APIs, profile UI, agent profile tools, tests around profile extraction.
- Depends on `add-vector-long-term-memory-store` for durable candidate/evidence storage, though basic validators can be implemented earlier.
