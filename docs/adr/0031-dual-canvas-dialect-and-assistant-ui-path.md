# 0031 - Dual-canvas layout, shared event dialect, and the assistant-ui path

Date: 2026-09-25

## Status

Accepted

## Context

User feedback named the multi-agent experience as incoherent: three independent routing brains could disagree with what the UI displayed, handoffs and delegations happened invisibly, waits had no progress shape, and transcript refreshes could flicker or revert. Visually the product wore a yellow-toned "fallen leaves" skin — and in a job-hunting product yellow literally reads as failure ("黄了").

## Decision

Three structural changes and one visual reset, shipped as one release train:

1. **Run Admission is deterministic** (see ADR-0029): the intent envelope is the first worker step, clarification is a durable waiting-user run, and the browser renders whatever the worker decides.
2. **The event dialect has a single source**: a shared descriptor module defines every user-facing event type with its safe fields and component key. Producers, projection whitelists, observer branches and render components all import it; a consistency test fails the build when a registered safe type lacks a component. New semantics adopt AG-UI vocabulary (subagent.*, step.*, messages.snapshot) without renaming existing events.
3. **The worker is the sole transcript writer** (see ADR-0030).
4. **The dual-canvas layout**: a journey rail (conversations as job-search legs with task icons and status), a quiet chat face (warm porcelain; only dialogue, approval cards and progress tracks), and an analyst face (deep charcoal; reports, proposal previews and evidence open there instead of flooding the chat column; maximized it becomes the workbench).

The visual system is a de-yellowed adaptation of a claude-style DESIGN.md base (from the VoltAgent/awesome-design-md collection): porcelain paper canvas, cinnabar as the sole emotional axis (red reads as success in job-hunting culture), deep charcoal for the analyst face, LXGW WenKai display type with Noto Sans SC body, Lucide line icons at a single stroke width, and an explicit ban on emoji-as-icons, purple gradients, glass card walls and Inter. assistant-ui remains the chosen vehicle for the chat shell; its ExternalStoreRuntime maps the run observer store, its ApprovalCard form replaces the gate card, and message edit/branch callbacks stay disabled because durable runs are immutable. The library swap is staged after the event dialect stabilizes rather than inside the same train.

## Consequences

One brain decides, one vocabulary describes, one writer persists, and two faces present — the mismatch classes that made the product feel incoherent are structurally closed rather than patched. The staged assistant-ui swap carries integration risk (React 19 compatibility, branch limitations) that is deliberately isolated from the semantic work; the domain cards and the approval contract it will consume already exist and render under the new tokens.
