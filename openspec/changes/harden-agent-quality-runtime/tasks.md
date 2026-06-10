# Tasks: harden-agent-quality-runtime

## 1. Baseline Audit

- [x] 1.1 Inventory all action tools that mutate CV, JD, reports, offers, profile, memory, sessions, or files.
- [x] 1.2 Classify tools by risk: read-only, low-risk write, high-risk write, destructive write.
- [x] 1.3 Identify all runtime SQLite imports and confirm which are still reachable with `DB_DRIVER=postgres`.
- [x] 1.4 Add regression fixtures for current failure modes: placeholder resume save, half-written content, markdown/code fences in CV, false success claims, lost run state after refresh.

## 2. Postgres Canonical Runtime Gates

- [x] 2.1 Add a Postgres cutover checklist script that reports runtime driver, reachable SQLite imports, row counts, and hash checks.
- [x] 2.2 Add Postgres backup and restore scripts for local/LAN deployment.
- [x] 2.3 Mark SQLite as read-only archive when Postgres is active.
- [x] 2.4 Remove or isolate production server routes that instantiate SQLite directly under Postgres mode.
- [x] 2.5 Add tests proving CV/session/report/JD writes use Postgres repositories when `DB_DRIVER=postgres`.

## 3. Agent Run Ledger

- [x] 3.1 Add Postgres schema for `agent_runs` and `agent_run_steps`.
- [x] 3.2 Add repository methods to create, update, append step, cancel, resume, and list active runs.
- [x] 3.3 Emit run events from the agent loop and persist phase/tool/verifier state.
- [x] 3.4 Recover active run state when the user refreshes, switches session, or returns to the agent page.
- [x] 3.5 Add admin/debug view for recent failed runs without leaking full private document text.

## 4. Task Contracts

- [x] 4.1 Define task contract schema for `resume_edit`, `jd_evaluation`, `offer_evaluation`, `interview_coaching`, `profile_update`, and `file_export`.
- [x] 4.2 Build contract creation before high-risk tool execution.
- [x] 4.3 Store base version/hash and success criteria in the run ledger.
- [ ] 4.4 Prevent final success messages when the contract has unmet criteria.

## 5. Verified Write Tool Protocol

- [x] 5.1 Define shared `VerifiedActionResult` with `precheck`, `mutation`, `readBack`, `verifier`, `rollback`, and `evidence`.
- [x] 5.2 Add deterministic validators for document fields: min length, placeholder text, code fences, markdown control text, truncated output, and target-section mismatch.
- [ ] 5.3 Require read-back verification for every high-risk action tool.
- [ ] 5.4 Add optimistic concurrency checks using base hash or version id.
- [ ] 5.5 Prevent tools from returning `success: true` unless read-back verification passes.

## 6. Resume Draft Approval Flow

- [ ] 6.1 Add `create_resume_edit_proposal` to create a draft with section id, base hash, proposed content, reason, and risk flags.
- [ ] 6.2 Add `apply_resume_edit_proposal` to apply only approved drafts inside a transaction.
- [ ] 6.3 Add `discard_resume_edit_proposal` and rollback support.
- [ ] 6.4 Render resume edit proposals as diff cards in agent chat and/or CV page.
- [ ] 6.5 Migrate `save_resume_section` to legacy-safe wrapper that routes agent writes through proposals.
- [ ] 6.6 Add tests for refresh/resume during a pending proposal.

## 7. Extend Verified Writes

- [ ] 7.1 Apply verified-write protocol to JD creation/update from OCR and evaluation.
- [ ] 7.2 Apply verified-write protocol to JD evaluation report persistence.
- [ ] 7.3 Apply verified-write protocol to offer evaluation and offer report persistence.
- [ ] 7.4 Apply verified-write protocol to profile signal promotion and memory persistence.
- [ ] 7.5 Apply file existence/size/hash verification to exports and PDF downloads.

## 8. Self-Healing Policy Engine

- [x] 8.1 Define error categories: transient, validation_failed, read_back_mismatch, base_version_conflict, unclear_intent, destructive_risk, policy_denied.
- [x] 8.2 Add bounded retry policy for transient failures.
- [x] 8.3 Add rollback policy for read-back mismatch or partial writes.
- [x] 8.4 Add one-question clarification policy for unclear intent or content mismatch.
- [x] 8.5 Add safe-failure user messages that include what was protected and what the user can do next.

## 9. UI And Observability

- [x] 9.1 Show run phases: planning, executing, verifying, repairing, waiting for approval, succeeded, failed.
- [x] 9.2 Show verifier evidence for high-risk writes in a compact status card.
- [ ] 9.3 Add "resume run" and "cancel run" controls for active durable runs.
- [ ] 9.4 Add user-facing rollback affordance for the latest document edit.
- [x] 9.5 Log verifier failures with task type, tool, run id, and redacted reason.

## 10. Framework Adapter Spike

- [x] 10.1 Define `AgentRuntimeAdapter` interface.
- [x] 10.2 Implement current orchestrator behind the adapter.
- [ ] 10.3 Prototype one external runtime option against the resume draft/apply flow.
- [ ] 10.4 Compare current orchestrator vs external runtime on reliability, run recovery, tool governance, latency, integration cost, and developer ergonomics.
- [ ] 10.5 Decide whether to keep current orchestrator, wrap it, or migrate incrementally.

## 11. Evals And Release Gates

- [x] 11.1 Add baseline eval for resume edit corruption.
- [x] 11.2 Add boundary eval for short-but-valid manual edits vs invalid agent writes.
- [x] 11.3 Add regression eval for "agent claims saved but verifier failed".
- [x] 11.4 Add window-switch recovery eval.
- [ ] 11.5 Run OpenSpec validation, TypeScript, targeted tests, full test suite, and LAN smoke before apply is considered complete.
