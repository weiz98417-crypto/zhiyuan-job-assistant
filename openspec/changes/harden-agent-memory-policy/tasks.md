# Tasks: harden-agent-memory-policy

## 1. Policy Registry

- [ ] 1.1 Define task types for resume optimization, JD evaluation, offer evaluation, interview coaching, profile growth, reference resume save, and general chat.
- [ ] 1.2 Add a central policy registry with allowed source types, statuses, scopes, budgets, and candidate-memory rules.
- [ ] 1.3 Map existing agent tools and context assembly calls to explicit task types.
- [ ] 1.4 Add default-deny behavior for unknown task types.

## 2. Enforcement

- [ ] 2.1 Enforce policy filters before prompt assembly.
- [ ] 2.2 Filter by user id, visibility, status, source type, task type, and memory type.
- [ ] 2.3 Add context budget enforcement per task type.
- [ ] 2.4 Add required source labels for every injected memory block.
- [ ] 2.5 Add clarification fallback when user text and uploaded content imply conflicting tasks.

## 3. Agent-Specific Rules

- [ ] 3.1 Restrict JD evaluation to JD, resume/profile facts, preferences, and same-user JD report memory.
- [ ] 3.2 Restrict offer evaluation to offer, compensation preference, location/work-style preference, and same-user offer memory.
- [ ] 3.3 Restrict interview coaching to bound JD/resume snapshots and interview session memory.
- [ ] 3.4 Allow resume optimization to use excellent-resume snippets and patterns.
- [ ] 3.5 Keep general chat from retrieving broad semantic memory by default.

## 4. Denial Logging And Debugging

- [ ] 4.1 Log denied memory sources with task type, agent id, source type, source id, and reason.
- [ ] 4.2 Expose policy decision traces in development or admin diagnostics without leaking private text.
- [ ] 4.3 Add tests for source labels and denied-source traces.

## 5. Tests And Evals

- [ ] 5.1 Test JD evaluation cannot receive raw excellent-resume snippets.
- [ ] 5.2 Test offer evaluation cannot receive unrelated JD or reference resume memory.
- [ ] 5.3 Test interview coaching does not forget bound JD/resume snapshots after user correction.
- [ ] 5.4 Test resume optimization can receive allowed excellent-resume snippets.
- [ ] 5.5 Test unknown task type fails closed.
- [ ] 5.6 Run OpenSpec validation for this change.
