# Tasks: add-memory-feedback-promotion

## 1. Status And Transition Model

- [ ] 1.1 Audit existing memory and reference resume status values.
- [ ] 1.2 Define allowed transitions for candidate, active, rejected, disabled, and deprecated memory.
- [ ] 1.3 Add transition guards for owner, admin, team-shared, and system-generated actions.
- [ ] 1.4 Add audit metadata for status transitions.

## 2. Feedback Capture

- [ ] 2.1 Ensure optimization outputs record used reference chunk ids and pattern memory ids.
- [ ] 2.2 Capture accepted, saved, rejected, dismissed, and heavily edited user actions.
- [ ] 2.3 Store optional textual feedback and edit-distance or diff summary when available.
- [ ] 2.4 Attribute feedback to role category, task type, JD id, resume section, and user id.

## 3. Promotion And Demotion Rules

- [ ] 3.1 Implement conservative private-memory promotion from repeated positive feedback.
- [ ] 3.2 Require admin approval before team-shared candidate memory becomes active for other users.
- [ ] 3.3 Downrank or demote memories with repeated negative feedback.
- [ ] 3.4 Reject generic, incomplete, low-evidence, copied, or policy-violating patterns.
- [ ] 3.5 Add stale or conflicting memory handling.

## 4. Retrieval Reranking

- [ ] 4.1 Add feedback-derived trust score to memory retrieval ranking.
- [ ] 4.2 Scope feedback effects by role category, task type, section type, and similarity.
- [ ] 4.3 Return explainable ranking inputs for debugging and governance UI.
- [ ] 4.4 Ensure disabled, rejected, or ineligible memory is excluded.

## 5. Tests And Evals

- [ ] 5.1 Test one accepted output does not auto-promote team-shared memory.
- [ ] 5.2 Test repeated positive private feedback can promote candidate memory.
- [ ] 5.3 Test repeated negative feedback downranks or demotes memory.
- [ ] 5.4 Test feedback affects similar tasks more than unrelated tasks.
- [ ] 5.5 Test rejected and disabled memories are not retrieved.
- [ ] 5.6 Run OpenSpec validation for this change.
