# 0029 - Run Admission is deterministic; the intent envelope is the first worker step

Date: 2026-09-25

## Status

Accepted (revises the sequencing described in ADR-0017; the authority conclusion stands)

## Context

The intent envelope (structured LLM routing introduced in 0.11.0-A) initially ran inside the run-creation POST. That serialised a model call into the request path — worst case ~17s before any receipt — and produced three uncoordinated routing brains: a browser-side envelope whose LLM branch was dead code (no key in the client bundle, permanently falling back to regex), the server envelope, and a runtime classifier. The browser brain fed the UI's agent label while the server brain chose the actual task, so the interface could name one agent while another worked; a server-side clarification question was replaced by a dead generic message because the client had no branch for it.

## Decision

Run Admission on the POST path is purely deterministic: idempotent requestId replay, active-run conflict check, and immediate run creation with a sub-second receipt. The intent envelope runs as the first worker step and its decision flows back as events:

- A confident envelope task (LLM or the zero-ambiguity fast path) that differs from the admitted task redirects the run in place — contract rebuilt, `agent_switch` emitted — recorded in the audit trail alongside the admitted task.
- Low confidence creates a **clarification run**: a general_chat run whose success criterion is asking one precise question, entering waiting-user (the safe switch point). The user's reply continues the same run; the envelope may then redirect it to the real task. A clarify run asks at most two questions.
- The regex fallback may never redirect a contract — it records its guess as audit only, so a keyless environment degrades to deterministic admission behaviour instead of guessing.

The browser submits turns with hints and renders events; it holds no routing logic, and its pending-task contract construction was deleted.

## Consequences

The label/behaviour mismatch class disappears structurally: one brain, and its decision reaches the UI as an event. Receipt latency no longer depends on model availability. Clarification is durable (belongs to a run, survives refresh) instead of a transient 202. The known deviation from the earlier sketch: the clarify run redirects in place rather than completing and spawning a new run, because the store's claim is global FIFO — recorded as a simplification with identical user-visible behaviour. Envelope failures degrade to deterministic admission, never to interrogation loops.
