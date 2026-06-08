# Change: harden-agent-memory-policy

## Why

As more agents read long-term memory, prompt instructions alone are not enough. Each agent needs enforceable source policies so JD evaluation, offer evaluation, interview coaching, resume optimization, profile growth, and general chat receive only the memory types they are allowed to use. This prevents hallucinated context, privacy leaks, stale facts, and the exact failure mode where one workflow contaminates another.

## What Changes

- Add a centralized agent memory policy registry by task type and agent.
- Enforce allowed source types, statuses, visibility scopes, and context budgets before memory reaches the model.
- Add denial logging and source labels for debugging.
- Add tests proving agents cannot access disallowed raw memory even when the user request is ambiguous.
- Add policy-aware fallbacks so agents ask clarification instead of silently using the wrong memory.

## Non-Goals

- Do not redesign the whole agent loop.
- Do not change image intake routing in this change.
- Do not add new memory storage tables unless policy enforcement requires missing metadata.
- Do not make every agent read every memory source.

## Capabilities

### Modified Capabilities

- `agent-memory`: add enforceable source policy requirements.
- `agent-tools`: add policy-aware memory tool execution requirements.

## Dependencies

- Depends on `wire-agents-to-long-term-memory`.
- Should follow `add-memory-eval-harness` so the policy can be regression tested.
- Can land before or after governance UI.

## Impact

- Affected areas: agent context assembler, tool policy, memory retrieval filters, agent registry, interview/JD/offer/resume tool prompts, tests.
- Product impact: makes long-term memory safe enough to expand across agents without brittle prompt-only guardrails.
