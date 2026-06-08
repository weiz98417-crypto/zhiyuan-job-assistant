# Tasks: add-memory-feedback-promotion

## 1. Status And Transition Model

- [x] 1.1 Audit existing memory and reference resume status values.
- [x] 1.2 Define allowed transitions for candidate, active, rejected, disabled, and deprecated memory.
- [x] 1.3 Add transition guards for owner, admin, team-shared, and system-generated actions.
- [x] 1.4 Add audit metadata for status transitions.

## 2. Feedback Capture

- [x] 2.1 Ensure optimization outputs record used reference chunk ids and pattern memory ids.
- [x] 2.2 Capture accepted, saved, rejected, dismissed, and heavily edited user actions.
- [x] 2.3 Store optional textual feedback and edit-distance or diff summary when available.
- [x] 2.4 Attribute feedback to role category, task type, JD id, resume section, and user id.

## 3. Promotion And Demotion Rules

- [x] 3.1 Implement conservative private-memory promotion from repeated positive feedback.
- [x] 3.2 Require admin approval before team-shared candidate memory becomes active for other users.
- [x] 3.3 Downrank or demote memories with repeated negative feedback.
- [x] 3.4 Reject generic, incomplete, low-evidence, copied, or policy-violating patterns.
- [x] 3.5 Add stale or conflicting memory handling.

## 4. Retrieval Reranking

- [x] 4.1 Add feedback-derived trust score to memory retrieval ranking.
- [x] 4.2 Scope feedback effects by role category, task type, section type, and similarity.
- [x] 4.3 Return explainable ranking inputs for debugging and governance UI.
- [x] 4.4 Ensure disabled, rejected, or ineligible memory is excluded.

## 5. Tests And Evals

- [x] 5.1 Test one accepted output does not auto-promote team-shared memory.
- [x] 5.2 Test repeated positive private feedback can promote candidate memory.
- [x] 5.3 Test repeated negative feedback downranks or demotes memory.
- [x] 5.4 Test feedback affects similar tasks more than unrelated tasks.
- [x] 5.5 Test rejected and disabled memories are not retrieved.
- [x] 5.6 Run OpenSpec validation for this change.
