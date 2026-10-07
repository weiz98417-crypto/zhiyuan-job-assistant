# 0044 - The durable interview engine is the sole interview-state writer; the chat question graph is a pure projection

Date: 2026-10-03

## Status

Accepted (same shape as ADR-0036 for transcripts)

## Context

Interview flow runs two parallel state machines: the durable engine's phase machine (intro → tech → behavioral → reverse, plus follow-up bookkeeping) and the chat-side questionGraph, which re-infers main/follow-up/probe/reverse question kinds from message text via regex. Determining which one is the source of truth requires reading SESSION_STATE_RULES plus a 344-line rebind policy. This is the same class of defect ADR-0036 eliminated for transcripts: two writers for one state, reconciled by hope. The question-bank train (i) rewrites the question path anyway, so the seam is already open.

## Decision

The durable interview engine is the sole writer of interview session state: phases, question progression, follow-up and reverse-question bookkeeping. The chat-side question graph becomes a pure projection computed from persisted interview state and never infers question kinds from message text. Question selection flows through the question bank engine's single deep interface (input: 岗位族×轮次×难度 constraints plus resume/JD context; output: a question card with provenance label).

## Consequences

Rebind and recovery semantics live in one place; adding an interview style becomes data, not a second state machine to keep in sync. The projection may lag but can never contradict the engine. Behavior equivalence is accepted the way 0.12 did it: source-contract tests redirected at the new seam. If train i runs over schedule, this convergence is the first item to defer — but it may not be split into a third variant.
