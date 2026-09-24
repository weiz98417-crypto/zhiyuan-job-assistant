# 0027 - Multi-agent collaboration is governed handoff plus read-only delegation

Date: 2026-09-24

## Status

Accepted

## Context

The six specialist agents never talk to each other: an orchestrator classifies intent, one agent runs, and information moves between tasks only through user-initiated transitions on the legal task transition graph. Research into 2026 multi-agent frameworks (OpenAI Agents JS, LangGraph, Mastra, A2A protocol, pi) showed the industry converging on two primitives — handoff (transfer of responsibility) and delegation (agent-as-tool) — layered on deterministic durable orchestration, while free-form swarms and group chats receded (Mastra deprecated its Agent Network; pi argues against black-box subagents). Adopting any framework runtime wholesale would double-track against our Postgres durable run infrastructure and the Run Gate approval model.

## Decision

We implement the two primitives ourselves, borrowing the OpenAI Agents JS semantics, with governance as the primary constraint:

1. **Handoff (主责交接)** transfers responsibility only along edges of the legal task transition graph, with structured handoff metadata (reason plus artifact ids) and an on-handoff hook that re-checks permissions before any side effect. Off-graph handoffs require user confirmation.
2. **Delegation (研究委派)** is read-only in its first phase: a child Agent Run with `session_id` NULL, attributed through `parent_run_id` (the existing depth≤2, ≤4 active siblings, and cancel cascade apply), returning a structured summary that must satisfy an `outputSchema` declared by the delegating agent. Write tools never run inside delegated child runs.
3. Approval follows tools, not agents: Run Gate keeps deciding on (tool, params) regardless of which agent invoked it, and gate requests display the full delegation chain. A child agent's tool allowlist is the intersection of parent and child allowlists.
4. Internal collaboration messages adopt the A2A v1.0 vocabulary — AgentCard-style capability declarations, the Task lifecycle, Message/Part structures — in-process, without running the network protocol. Splitting agents into services later means wrapping this contract with an `@a2a-js/sdk` transport adapter, not a redesign.

## Consequences

Agents gain the ability to initiate collaboration without inheriting trust: a hallucinating delegation cannot write user data because child runs are read-only and gates stay tool-scoped. The transition graph remains the single product-level statement of legal journeys, now enforced for both user- and agent-initiated transitions. Delegation depth and read-only scope are deliberately conservative; widening them is a future decision backed by production attribution data from the parent/child run tree.
