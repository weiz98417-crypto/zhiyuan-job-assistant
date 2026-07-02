---
name: agent-system-optimization-loop
description: Run the Zhiyuan Job Assistant recurring Agent Chat and data-agent optimization loop. Use when auditing, testing, repairing, or scheduling ongoing improvements for self-positioning route lock, Agent page lifecycle state, cross-page data control, agent handoff/routing, subagent state persistence, tool card rendering, tool failures, output interception, image/JD/offer/resume intake, eval sedimentation, isolated worktree repair agents, evaluator agents, or the project's agent stability and usability loop.
---

# Agent System Optimization Loop

This skill runs the operational improvement loop for Zhiyuan Job Assistant. The primary goal is Agent Chat and data-agent reliability: conversations must remain coherent across page lifecycle changes, agent routing must stay intentional, and agent-triggered writes to other product pages must be precise, complete, and verified.

## Cadence And Health

- Scheduled cadence: every 2 hours.
- Current health status: automation is configured and has triggered before, but scheduled health is not proven until a scheduled run updates both this skill's `STATE.md` and the Codex automation `memory.md`.
- Treat `automation_empty_run` as P0 until one scheduled run produces assistant/tool activity and durable state write-back.

## Project Facts

- Repo root: the repository that contains this skill, normally the current working directory for the loop
- Runtime: Next.js 16, React 19, LAN service on port `3000`
- Current database target: PostgreSQL with pgvector through `DB_DRIVER=postgres` and `DATABASE_URL`
- SQLite status: fallback, migration source, or archive only
- Agent Chat subagents: general, JD evaluation, resume, interview, profile, offer
- Tool surface: query tools, action tools, interview tools, and MCP shim tools governed by metadata
- MCP status: project has an MCP manager and `/api/agent/mcp/call`, but current configured servers are external query-oriented only; no PostgreSQL/read-only database MCP connector is configured yet
- Admin governance surfaces: `/admin/agent-runs`, `/admin/agent-reviews`, `/admin/memory`

## Required Fact Sources

At the start of every loop, read these before acting:

1. `skills/agent-system-optimization-loop/SKILL.md`
2. `skills/agent-system-optimization-loop/STATE.md`
3. `CLAUDE.md`
4. `DATA_CONTRACT.md`
5. `docs/AGENT_TOOL_GOVERNANCE.md`
6. `docs/MEMORY_EVALS.md`

Then inspect current `git status --short`. Never rely on remembered project state when these files disagree.

## Audit Rotation

Each scheduled run must choose 3 to 5 audit categories. Include unresolved items from `STATE.md` first, then randomly choose stale categories from both the core Agent E2E pool and the broader eval-derived reliability pool. Do not repeat the same category, failure type, or entry point in consecutive runs unless it is unresolved or needs fix verification.

## First-Class Discovery Sources

Discovery is a required phase, not a prelude. Every scheduled loop must build a `discovery_snapshot` before selecting audit categories or dispatching repair work.

Read these discovery sources as first-class inputs:

1. `state_backlog`: unresolved P0/P1/P2 items from this file, including stale verifier items and previously blocked bundles.
2. `ci_failures`: latest local or GitHub CI/build/test failures when available. If remote CI cannot be inspected, record `ci_unavailable` with the attempted command/source.
3. `new_commits`: commits since the last recorded loop checkpoint, with changed files grouped by runtime surface such as Agent Chat, persistence, auth/LAN, memory, OCR/image intake, UI, tests, docs, or database.
4. `eval_failures`: deterministic eval/test failures from targeted commands and known project eval scripts.
5. `eval_candidates`: pending or recently created `agent_eval_candidates`, especially candidates tied to user-visible failures, missing read-back, intercepted output, context loss, image intake, or partial writes.
6. `agent_run_ledger`: recent failed, blocked, partial, intercepted, retried, or suspiciously successful Agent Runs and Agent Run Reviews.
7. `user_reported_regressions`: recent user-reported failures from `STATE.md`, automation memory, and current thread context.
8. `environment_health`: Postgres/pgvector readiness, LAN/auth availability, provider degradation, and automation runner health.

The snapshot must normalize each signal into:

- `source`: one of the discovery sources above
- `severity`: P0/P1/P2/P3
- `category`: one audit category or `unknown`
- `evidence`: command, file, run id, URL, row id, or concise observation
- `owner_surface`: likely code/data/UI/tooling surface
- `dedupe_key`: stable key used to merge repeats
- `suggested_next_action`: audit, repair, eval-only, blocked, or needs user input

Selection order:

1. P0 automation, environment, auth, data-loss, or user-data-isolation blockers.
2. P1 user-visible Agent E2E regressions with fresh evidence.
3. New failing CI/evals or new commits touching high-risk surfaces.
4. Pending eval candidates that can become deterministic evals.
5. Stale rotation categories not covered recently.

Every loop must record the snapshot summary in `STATE.md`, including sources checked, unavailable sources, chosen categories, skipped high-priority items with reasons, and dedupe decisions.

Primary Agent E2E audit pool:

- `self_positioning_route_lock`: self-positioning keeps stage, remembers user goal, and does not drift into JD/offer evaluation unless the user clearly changes intent.
- `agent_page_lifecycle_state`: leaving Agent Chat for another page and returning preserves active conversation, selected target agent, run/task state, stage, attachments, pending confirmations, visible tool cards, and recent context; continuing chat must not behave like a fresh amnesic session.
- `subagent_state_persistence`: active task/session state survives turns, page switches, resumes, and context compression.
- `agent_handoff_routing`: the system can correctly move from one target agent/task to another when the user changes intent, without stale locks or accidental fallbacks.
- `cross_page_data_control`: when Agent Chat is asked to modify another page or structured domain such as resume, profile, reports, memory, or settings, it locates the right target entity/section/field, writes complete data through governed tools/APIs, verifies read-back, and surfaces failures instead of claiming success.
- `tool_card_rendering`: tool outputs render as clear collapsible cards with status, type, evidence, and useful failure text instead of raw or ugly chat leakage.
- `tool_failure_contract`: failed tools, aborted tools, missing read-back, and contract mismatches are surfaced truthfully and create eval/eval-candidate evidence.
- `output_interception_or_truncation`: agent answers are not swallowed, over-summarized, blocked, partially returned, or replaced by generic fallback text.
- `image_intake_jd_offer_resume`: uploaded images are preserved at usable quality, classified, OCR/multimodal extracted, and routed to JD, offer, resume, or clarification flows.
- `resume_edit_apply_readback`: resume edits require proposal, apply confirmation, durable save, read-back, and no markdown placeholders in structured resume fields.
- `agent_run_resume_recovery`: resuming a run does not spam the same restored message and can either continue safely, pause clearly, or cancel.
- `memory_governance_feedback`: candidate memory approve/reject/promote controls show visible feedback and durable status transitions.
- `chat_layout_overflow`: long agent/tool output does not create page-wide horizontal scroll or make history/chat panes overlap.

Broader eval-derived reliability pool:

- `agent_runtime_stream_contract`: SSE events, runtime adapter behavior, retries, stop timing, malformed events, CJK token estimation, line buffering, and runtime errors remain observable and recoverable.
- `agent_context_compression_memory`: context assembly, long-term memory binding, compression visibility, stale-context avoidance, and memory policy are correct for the active task.
- `agent_run_ledger_truthfulness`: Agent Run debug/review/admin surfaces do not mark failed, blocked, partial, intercepted, or unverified work as success.
- `jd_pipeline_integrity`: JD text/link/image routing, extraction, A-G report completeness, summary quality, deduplication, persistence, candidate linkage, and partial-write recovery work together.
- `offer_pipeline_integrity`: offer routing, evaluation model, comparison policy, persistence, verified write/read-back, and user-facing summary are consistent.
- `resume_pipeline_integrity`: optimization, edit proposal/apply flow, save guards, markdown leakage prevention, section targeting, and database boundary are safe.
- `interview_pipeline_integrity`: one-question-at-a-time behavior, JD/resume binding, rebind policy, session state, and question rationale quality hold through a realistic interview loop.
- `profile_signal_quality_writeback`: profile extraction rejects fragments, generic words, JD snippets, chat noise, and unverified writes.
- `long_term_memory_quality`: excellent resume save flow, role/category confirmation, embeddings, retrieval, feedback reranking, admin/team approval boundaries, and no raw reference leakage are working.
- `auth_admin_lan_access`: login, cookies, admin approval, roles, coworker registration, and LAN access work when they block Agent E2E testing.
- `user_data_isolation`: applications, sessions, profiles, offers, references, memories, reports, and admin surfaces stay scoped to the correct user/team policy.
- `postgres_pgvector_boundary`: PostgreSQL/pgvector readiness, repository routing, migration/cutover drift, and absence of unexpected SQLite runtime paths are verified.
- `file_export_report_integrity`: exported files, PDFs, reports, and persisted artifacts have verified writes, readable records, and useful failure states.
- `discovery_news_external_degradation`: discovery save-from-JD, industry/news APIs, OCR/LLM/embedding providers, rate limits, timeouts, and graceful fallbacks behave predictably.
- `frontend_visual_layout_regression`: chat, history, admin governance, reports, loading, empty, and error states remain visually coherent.
- `security_tool_policy`: tool whitelist, hallucinated tool blocking, dangerous action policy, repair policy, and admin boundary checks remain enforced.

Prerequisite health checks:

- `auth_lan_cookie`: verify only when login/LAN auth blocks Agent E2E testing.
- `postgres_cutover`: verify before governed database assertions; failures block the audit instead of being hidden.
- `agent_run_governance`: verify when a user-visible Agent E2E failure is incorrectly shown as successful in run/review dashboards.

## Evidence Rules

- Use browser/UI testing for visible workflows.
- Use API probes for route behavior when UI evidence is too slow or ambiguous.
- Use PostgreSQL read-only probes or internal repository/API read-back for database-backed evidence. Do not assume a database MCP connector exists until it is explicitly implemented and verified.
- For Agent Run claims, verify `agent_runs`, `agent_run_steps`, `agent_run_reviews`, and `agent_eval_candidates`.
- If PostgreSQL is unavailable or the app silently falls back to SQLite for governed flows, mark the run `environment_blocked`; do not claim the audit completed.
- For write/export/admin tools, success requires read-back evidence matching `requiresReadBack` and `successContract` in `src/lib/agent/tool-governance.ts`.

## Repair Workflow

The main worktree is for audit orchestration and state only. Before code repair:

1. Classify the change size before implementation.
2. Create or attach to an OpenSpec change when the change affects runtime behavior, data schema, Agent routing, tool contracts, memory/profile/resume/report persistence, admin governance, authentication, LAN behavior, or user-visible workflows.
3. Keep pure audit notes, `STATE.md` updates, typo-only docs, and automation prompt clarifications as lightweight loop maintenance unless they change product behavior.
4. Use gstack to review the OpenSpec change tasks before implementation. The review must check whether tasks are testable, observable, scoped, and tied to eval/read-back evidence.
5. Create an isolated git worktree under a sibling directory such as `..\zhiyuan-loop-worktrees\<timestamp>-<slug>`.
6. Assign repair work to one or more worker agents with disjoint file ownership.
7. Tell workers they are not alone in the codebase and must not revert unrelated changes.
8. Keep external/stateful access through verified read-only database probes, internal repository/API read-back, or an explicitly implemented MCP connector. Current project MCP infrastructure is not enough for database inspection by itself.
9. Require each repair to add or update an eval/test when a deterministic check is possible.
10. If a deterministic eval is not possible yet, create or update an eval candidate and record the reason in `STATE.md`.

Do not mutate production data or run destructive git/database commands as part of the loop without explicit user approval.

## Issue Triage And Multi-Agent Dispatch

When a run finds more than one durable issue, triage before repair:

1. Group issues into independent bundles by likely root cause, ownership surface, file/data boundary, and OpenSpec scope.
2. Do not assign unrelated bundles to one repair agent just because they were found in the same run.
3. For multiple independent bundles, create one isolated git worktree per bundle under `..\zhiyuan-loop-worktrees\<timestamp>-<slug>`.
4. Assign one repair subagent per worktree/bundle whenever useful. Give each repair subagent only its bundle evidence, target OpenSpec change/task, allowed file ownership, required evals, and explicit instruction not to revert unrelated changes.
5. If bundles need overlapping files, schema changes, or shared runtime contracts, serialize them or merge them into one OpenSpec/worktree. Record the coupling reason in `STATE.md`.
6. Keep a separate reviewer/evaluator subagent for each repair bundle whenever possible.
7. Reviewer/evaluator agents are read-only by default. They review the diff, evidence, tests, OpenSpec tasks, Agent Run/read-back ledger, and user-visible behavior; they must not implement fixes in the same worktree.
8. The supervising loop agent integrates evaluator results, updates state, and leaves unresolved or blocked bundles for the next run instead of marking the whole loop successful.

## OpenSpec And Gstack Gate

Use this gate before assigning repair agents:

- `state_only`: no OpenSpec required. Applies to audit reports, `STATE.md` bookkeeping, and loop prompt clarifications that do not affect app behavior.
- `small_fix`: attach to an existing relevant OpenSpec change if one exists; otherwise create a minimal change when the fix touches runtime code or governed behavior.
- `medium_change`: create a dedicated OpenSpec change with `proposal.md`, `tasks.md`, and `specs/.../spec.md`; add `design.md` when architecture or data flow changes.
- `large_or_risky_change`: create a dedicated OpenSpec change and run gstack plan/engineering review before implementation. Includes schema migrations, Agent loop changes, task routing, tool governance, memory sharing, auth, and report persistence.

For every OpenSpec change:

1. Write tasks as verifiable steps, not vague intentions.
2. Include eval/test obligations in the tasks.
3. Include read-back or ledger evidence for write/export/admin flows.
4. Run a gstack review workflow suitable to the change: plan/engineering review for architecture, QA/browser review for UI workflows, or diff review for code-ready patches.
5. Record the OpenSpec change id and gstack review result in `STATE.md`.

## Evaluator Workflow

Repair is not closed by the repair agent's own confidence.

After each repair:

1. Spawn or use an independent evaluator agent.
2. Give the evaluator the worktree path, diff summary, test commands, and the original failure evidence.
3. Have the evaluator review the diff, run or inspect relevant tests, check Agent Run review/read-back evidence, and classify the result as `pass`, `warning`, `fail`, or `blocked`.
4. Require a numeric evaluator score from 0 to 100. The minimum passing score is 90.
5. Score with this rubric: root-cause evidence 15, scope isolation/no unrelated churn 10, implementation correctness 20, deterministic eval/regression coverage 15, read-back or ledger evidence 15, user-visible verification when applicable 10, safety/security/data isolation 10, documentation/state update 5.
6. Apply hard-fail gates regardless of score: missing reproduction evidence, missing required read-back, failing targeted tests, OpenSpec task drift without review, unrelated destructive changes, user-data leakage, or evaluator unable to inspect the diff/evidence.
7. If evaluator returns less than 90, `fail`, `blocked`, or serious `warning`, keep the issue open in `STATE.md` and schedule it for the next loop.
8. Record the score, rubric breakdown, hard-fail gates, and verdict in `STATE.md`.

## Eval Sedimentation

Every durable failure pattern must become an eval or eval candidate. Prefer existing taxonomy:

- `missing_readback`
- `tool_contract_mismatch`
- `context_loss`
- `agent_page_lifecycle_loss`
- `cross_page_data_write_failure`
- `memory_governance_failure`
- `profile_signal_noise`
- `image_intake_failure`
- `route_lock_failure`
- `resume_partial_write`
- `ui_overflow_regression`
- `postgres_cutover_drift`

Use existing commands when relevant:

```powershell
cmd /c npm run test -- <specific test files>
cmd /c npm run eval:memory
cmd /c npm run check:postgres
cmd /c npm run check:postgres-cutover
cmd /c npm run build
```

## State Update Contract

Update `skills/agent-system-optimization-loop/STATE.md` at the end of every run, including blocked runs.

Record:

- timestamp and run type
- audit seed or selection method
- categories checked
- evidence gathered
- issues found
- issue bundles and dispatch decisions
- worktrees created
- OpenSpec change id or reason no OpenSpec was needed
- gstack review result
- repair/evaluator agents used
- evaluator score and hard-fail gates
- tests/evals run
- unresolved backlog
- categories to avoid repeating next run
- recommended next focus

Only mark a run `closed` when audit, isolated repair if needed, independent evaluator score >= 90 with no hard-fail gates, eval sedimentation, and state update are all complete. Otherwise use `needs_engineering`, `waiting_user`, or `blocked`.
