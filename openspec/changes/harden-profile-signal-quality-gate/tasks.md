## 1. Quality Contract

- [ ] 1.1 Define allowed profile signal categories: hard skill, soft skill, domain, tool, method, project experience, preference, goal, constraint.
- [ ] 1.2 Define rejected patterns: generic words, incomplete phrases, JD-only requirements, chat filler, tool output fragments, duplicates.
- [ ] 1.3 Define source weights for resume, JD, offer, interview answer, user preference, and ordinary chat.
- [ ] 1.4 Define minimum evidence requirements.

## 2. Extraction Pipeline

- [ ] 2.1 Update profile mining to emit candidates with source metadata.
- [ ] 2.2 Add deterministic validators before durable storage.
- [ ] 2.3 Add normalization and synonym grouping.
- [ ] 2.4 Add deduplication across existing signals.
- [ ] 2.5 Add confidence and importance scoring.

## 3. Profile Storage And UI

- [ ] 3.1 Store candidates separately from confirmed profile facts.
- [ ] 3.2 Bind each displayed profile skill/preference to evidence.
- [ ] 3.3 Hide rejected/low-confidence candidates from the main profile view.
- [ ] 3.4 Add confirm, edit, reject, and delete actions for pending candidates.

## 4. Cleanup And Tests

- [ ] 4.1 Add a cleanup script for existing low-quality profile entries.
- [ ] 4.2 Add regression tests for observed bad entries such as partial phrases and generic words.
- [ ] 4.3 Test JD requirements do not become user skills without resume/user evidence.
- [ ] 4.4 Test confirmed user edits override model inference.
- [ ] 4.5 Validate this OpenSpec change.
