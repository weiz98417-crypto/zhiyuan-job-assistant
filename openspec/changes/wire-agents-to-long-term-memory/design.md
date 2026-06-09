# Design: wire-agents-to-long-term-memory

## Context

Agents currently read some recent context and profile data, but the behavior is uneven. Problems seen in testing include losing JD/resume grounding during interview, generic profile extraction, and incomplete report summaries. A memory substrate only helps if agents retrieve and write back through strict task policies.

## Goals / Non-Goals

**Goals:**

- Build task-specific memory context for JD, offer, resume, interview, and profile agents.
- Use structured facts before semantic retrieval.
- Keep current JD/resume/report snapshots binding across an interview session.
- Write post-task observations as candidate memory with evidence.

**Non-Goals:**

- Do not let agents freely query all memory without task filters.
- Do not let model output directly confirm profile facts.
- Do not increase context size without budget/rerank controls.

## Decisions

- Create a memory context assembler that accepts task type, user id, current session id, and optional source ids.
- Retrieval order is structured facts first, semantic snippets second, recent session digest third.
- Interview sessions must carry immutable snapshot ids for the JD/resume/report used to start the session.
- Agent writeback always creates candidate memory/evidence; profile quality gate decides whether it becomes confirmed.
- Context returned to LLMs must be compact and source-labeled.

## Risks / Trade-offs

- More retrieval can make prompts noisy -> mitigate with task filters, top-k, and compression.
- Old bad profile signals could leak into context -> mitigate by relying on confirmed/high-confidence status after quality gate.
- Snapshot binding can feel rigid when users intentionally switch JD/resume -> mitigate with explicit rebind confirmation.

## Migration Plan

1. Add memory context assembler.
2. Wire query tools to structured and semantic retrieval.
3. Wire JD/offer/resume/interview agents one at a time.
4. Add candidate memory writeback after completed tasks.
5. Add regression tests for grounding and user isolation.
