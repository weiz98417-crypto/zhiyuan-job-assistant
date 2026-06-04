## 1. Quality Contract

- [x] 1.1 Define allowed profile signal categories: hard skill, soft skill, domain, tool, method, project experience, preference, goal, constraint.
- [x] 1.2 Define rejected patterns: generic words, incomplete phrases, JD-only requirements, chat filler, tool output fragments, duplicates.
- [x] 1.3 Define source weights for resume, JD, offer, interview answer, user preference, and ordinary chat.
- [x] 1.4 Define minimum evidence requirements.

## 2. Extraction Pipeline

- [x] 2.1 Update profile mining to emit candidates with source metadata.
- [x] 2.2 Add deterministic validators before durable storage.
- [x] 2.3 Add normalization and synonym grouping.
- [x] 2.4 Add deduplication across existing signals.
- [x] 2.5 Add confidence and importance scoring.

## 3. Profile Storage And UI

- [x] 3.1 Store candidates separately from confirmed profile facts.
- [x] 3.2 Bind each displayed profile skill/preference to evidence.
- [x] 3.3 Hide rejected/low-confidence candidates from the main profile view.
- [x] 3.4 Add confirm, edit, reject, and delete actions for pending candidates.

## 4. Cleanup And Tests

- [x] 4.1 Add a cleanup script for existing low-quality profile entries.
- [x] 4.2 Add regression tests for observed bad entries such as partial phrases and generic words.
- [x] 4.3 Test JD requirements do not become user skills without resume/user evidence.
- [x] 4.4 Test confirmed user edits override model inference.
- [x] 4.5 Validate this OpenSpec change.
