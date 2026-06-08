# Tasks: add-memory-eval-harness

## 1. Eval Fixtures

- [ ] 1.1 Create redacted AI Product Manager excellent-resume fixtures with structured sections.
- [ ] 1.2 Create one target user resume fixture and one AI Product Manager JD fixture.
- [ ] 1.3 Add cross-user private/team reference fixtures.
- [ ] 1.4 Add unrelated, JD, offer, and low-quality resume boundary fixtures.

## 2. Deterministic Eval Harness

- [ ] 2.1 Add deterministic mock embedding helpers for repeatable retrieval tests.
- [ ] 2.2 Add an eval runner that can seed references, run retrieval, and collect ranked snippets.
- [ ] 2.3 Add no-memory vs memory-enabled resume optimization comparison fixtures.
- [ ] 2.4 Add report output with retrieval hits, source labels, copy overlap, and policy violations.

## 3. Baseline Evals

- [ ] 3.1 Test pasted excellent resume save and chunk indexing.
- [ ] 3.2 Test screenshot-extracted resume save using mocked OCR text.
- [ ] 3.3 Test missing role-category follow-up preserves extracted resume text.
- [ ] 3.4 Test resume optimization retrieves role-relevant excellent-resume snippets and patterns.

## 4. Boundary Evals

- [ ] 4.1 Test unrelated images are not saved as excellent resumes.
- [ ] 4.2 Test JD and offer screenshots do not route to excellent-resume save.
- [ ] 4.3 Test private reference resumes never cross user boundaries.
- [ ] 4.4 Test team references require approval and redaction before shared retrieval.
- [ ] 4.5 Test JD and offer agents do not receive raw excellent-resume snippets.
- [ ] 4.6 Test optimized output does not copy long reference phrases verbatim.

## 5. Regression Evals

- [ ] 5.1 Test accepted snippets move up for similar future retrieval.
- [ ] 5.2 Test rejected snippets move down without disabling the whole resume.
- [ ] 5.3 Test weak candidate patterns are not retrieved as active guidance.
- [ ] 5.4 Test embedding failures preserve saved references and expose reindex state.

## 6. Provider Smoke And CI

- [ ] 6.1 Add an opt-in provider smoke command that verifies configured embedding dimension without printing secrets.
- [ ] 6.2 Add deterministic eval command to the project test workflow.
- [ ] 6.3 Document which evals are blocking and which are manual review only.
- [ ] 6.4 Run OpenSpec validation for this change.
