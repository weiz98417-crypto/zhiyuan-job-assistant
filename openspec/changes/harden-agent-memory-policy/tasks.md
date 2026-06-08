# Tasks: harden-agent-memory-policy

## 1. Policy Registry

- [x] 1.1 Define task types for resume optimization, JD evaluation, offer evaluation, interview coaching, profile growth, reference resume save, and general chat.
- [x] 1.2 Add a central policy registry with allowed source types, statuses, scopes, budgets, and candidate-memory rules.
- [x] 1.3 Map existing agent tools and context assembly calls to explicit task types.
- [x] 1.4 Add default-deny behavior for unknown task types.

## 2. Enforcement

- [x] 2.1 Enforce policy filters before prompt assembly.
- [x] 2.2 Filter by user id, visibility, status, source type, task type, and memory type.
- [x] 2.3 Add context budget enforcement per task type.
- [x] 2.4 Add required source labels for every injected memory block.
- [x] 2.5 Add clarification fallback when user text and uploaded content imply conflicting tasks.

## 3. Agent-Specific Rules

- [x] 3.1 Restrict JD evaluation to JD, resume/profile facts, preferences, and same-user JD report memory.
- [x] 3.2 Restrict offer evaluation to offer, compensation preference, location/work-style preference, and same-user offer memory.
- [x] 3.3 Restrict interview coaching to bound JD/resume snapshots and interview session memory.
- [x] 3.4 Allow resume optimization to use excellent-resume snippets and patterns.
- [x] 3.5 Keep general chat from retrieving broad semantic memory by default.

## 4. Denial Logging And Debugging

- [x] 4.1 Log denied memory sources with task type, agent id, source type, source id, and reason.
- [x] 4.2 Expose policy decision traces in development or admin diagnostics without leaking private text.
- [x] 4.3 Add tests for source labels and denied-source traces.

## 5. Tests And Evals

- [x] 5.1 Test JD evaluation cannot receive raw excellent-resume snippets.
- [x] 5.2 Test offer evaluation cannot receive unrelated JD or reference resume memory.
- [x] 5.3 Test interview coaching does not forget bound JD/resume snapshots after user correction.
- [x] 5.4 Test resume optimization can receive allowed excellent-resume snippets.
- [x] 5.5 Test unknown task type fails closed.
- [x] 5.6 Run OpenSpec validation for this change.
