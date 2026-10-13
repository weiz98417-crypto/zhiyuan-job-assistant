# Spec 40: E2E 失败修复与一次生产切换门禁

Target label: `ready-for-agent`
Depends on: 已确认的 Run Admission、Run Continuation、Task Program、Conversation Item、简历真源、记忆治理、面试单写者、事实门，以及 ADR-0022/0026/0029/0030/0031/0033/0034/0041/0042/0045/0046；[线上 E2E 失败修复总方案](../testing/e2e-remediation-plan-2026-10-13.md)

## Problem Statement

线上 0.13.2 的真实 E2E 审计确认了 67 个去重问题：5 个 P0、44 个 P1、18 个 P2。问题集中在用户看见的结果和系统事实不一致：面试控制指令被当成答案，已接受的纠正长期停在 pending，账号切换后浏览器资料串号，职业定位把“在学 React”和示例经历写成用户事实，图片用途已回答仍被重复追问，工具成功后任务仍索要原材料或谎称未完成，Offer 缺失条件被写成确定事实，参考简历审批错用了本人 CV。

其他页面也存在同类风险：报告深链、投递状态、面试轮次、统计漏斗、周报时间范围、简历版本/hash、参考来源、提醒、Offer 对比、错误态和可访问性无法形成可验证闭环。当前 392 项规范为 AgentChat 222 项和其他页面 170 项，历史覆盖状态为 pass 0、fail 117、partial 229、blocked 44、not_run 2；这表示完整证据尚未齐全，不能简单解释为所有正常子分支都失败。

用户需要一个能持续交付的修复过程：每个问题都有唯一归属、真实输出和独立读回，失败不会被重试覆盖，历史数据不会被猜测改写，已知 P0 不会带病发布，392 项验收缺口不会被按钮可点击或工具 success 掩盖。

## Solution

建立一套分批修复、分批验收、单次正式生产切换的 E2E remediation 纵切，使用三个外部行为 seam：

1. **Runtime / AgentChat seam**：从用户输入、Run Admission、Continuation Stimulus、Run Contract、Tool Attempt 到 Conversation Item 和最终用户答案，验证同一个目标、材料、归属、状态和副作用闭环。它覆盖面试、上下文、合同、交接、委派、附件转录、记忆召回和事实来源。
2. **服务端业务实体 seam**：从真实鉴权 API/Worker 到 PostgreSQL、文件和报告实体，验证 CV、JD、Offer、投递、记忆、参考材料、分析统计和历史版本的事务、hash、来源、幂等与读回。
3. **浏览器页面 seam**：从真实 Chromium 操作到服务端实体和刷新恢复，验证页面状态、URL 深链、错误/空态区分、滚动、焦点、可访问性、媒体降级和跨页面交接。

修复按 13 个工作包组织、6 个内部实施/验收批次（B0–B5）推进。B0–B4 只生成隔离或预生产候选及 canary 证据；为遵守 ADR-0022/0026，生产 runtime ownership 只在 B5 做一次统一切换，不能把每个模块分别暴露在线上。先建立 owner 隔离、持久 continuation、合同完成事实和面试单写者，再修复 CV/Offer/记忆/投递等核心实体，随后收口页面体验和媒体，最后执行全量验收与正式发布。每批生成固定 code/model/prompt/tool/fixture/judge 版本、证据账本、迁移 dry-run、回滚包和 canary 结果。

发布必须满足确定性硬门禁：P0 全部关闭；owner、ACL、来源、hash、状态、数值、幂等、禁止副作用和独立读回无错误；未知条件不能写成已知；内部 reasoning/DSML 不能进入用户安全视图；392 项均有 pass 或有依据的 N/A。关键任务使用版本化 rubric 和最低分，辅助任务低分显示限制并降级，质量 Judge 不能覆盖确定性失败。

历史数据处理采用只读扫描 → 受影响清单 → 分级批准 → 可逆 patch → 独立读回。无 owner 的旧浏览器缓存停止业务读取并隔离保留；只有 owner、服务端同步标识和内容 hash 均匹配才自动迁移。非终态旧 Agent Run 按 ADR-0029 保留原 runId、conversation 绑定和原始输入，在同一 Run 内基于持久证据重建；缺少可验证事实时先读回或请求用户重新确认，仍无法补验则安全暂停并保留迁移记录，不伪造完成。真实用户的错误 Offer 条件、错源参考材料和污染面试记录逐条确认，无法证明的只标记 `needs_review`。

## User Stories

1. As a job seeker, I want my interview control instruction to pause or resume the session, so that it is never recorded as an answer to the current interview question.
2. As a job seeker, I want an interview answer to remain bound to the question I saw, so that feedback and scoring refer to the right evidence.
3. As a job seeker, I want a paused interview to preserve its transcript and phase, so that resuming cannot create a phantom question or reset my progress.
4. As a job seeker, I want an accepted correction to be consumed exactly once, so that the same correction is neither left pending nor applied twice.
5. As a job seeker, I want a continuation after refresh or worker recovery to use the same Run Context, so that the agent remembers the material and constraints already confirmed.
6. As a job seeker, I want a short answer such as “评估” to refer to the image or document I just supplied, so that the agent does not repeat a clarification it already resolved.
7. As a job seeker, I want a valid image attachment to be sendable without placeholder text, so that I can start a material conversation naturally.
8. As a job seeker, I want a failed attachment parse and its honest fallback message persisted, so that refreshing does not erase the request or the next-step instruction.
9. As a job seeker, I want a successful tool result to be reflected in the final answer, so that the agent does not ask for material I already supplied.
10. As a job seeker, I want a task to finish according to its actual goal, so that importing a resume does not unexpectedly require optimization and applying it.
11. As a job seeker, I want a read-only task to remain read-only, so that a report explanation or fact整理 cannot silently create an Offer, report, application update, or memory fact.
12. As a job seeker, I want a handoff to show the receiving agent, purpose, constraints, source artifacts and findings, so that a new agent can continue without losing context.
13. As a job seeker, I want a delegated research result to use one stable delegation identity, so that started, finished, failed and parent-consumption events can be audited as one child operation.
14. As a job seeker, I want a legal task handoff from an application detail, so that negotiation and HR questions use the selected application and its Offer context rather than asking for the same material again.
15. As a job seeker, I want my career-positioning result to distinguish user statements, hypotheses and examples, so that an example cannot become my personal experience.
16. As a job seeker, I want “learning React” to remain learning React, so that the system never upgrades it to expert proficiency or a confirmed skill.
17. As a job seeker, I want positioning conclusions to show concise source labels and expandable evidence, so that I can inspect why a conclusion was made.
18. As a job seeker, I want a resume import to preserve my name, contact details, dates, numbers and source text across image formats, so that a pending import is complete enough to review.
19. As a job seeker, I want incomplete image extraction to be marked for review, so that missing fields are not silently treated as a valid active resume.
20. As a job seeker, I want resume optimization to preserve my facts and decline unsupported additions, so that a lack of metrics results in a question or advisory draft rather than fabricated achievements.
21. As a job seeker, I want an approved resume proposal to create a new traceable version, so that the previous version and its hash remain recoverable.
22. As a job seeker, I want a stale proposal to explain the version conflict and offer a rebuild path, so that a safe rejection is actionable.
23. As a job seeker, I want an applied proposal card to retain its rollback identity and source content, so that I can safely undo it after a refresh.
24. As a job seeker, I want a reference resume to retain its original source artifact, owner and subject, so that a third-party resume cannot be replaced by my own CV.
25. As a job seeker, I want a report to acknowledge skills already present in my resume, so that SQL evidence is not reported as completely absent.
26. As a job seeker, I want salary benchmarks to use one normalized currency and period, so that a 24–42K monthly range is not compared with 24–42 yuan per month.
27. As a job seeker, I want a broken report body to show an unreadable state and recovery action, so that metadata alone is not presented as a complete report.
28. As a job seeker, I want a report deep link to open the selected report, so that history navigation never falls back to an unrelated overview.
29. As a job seeker, I want report links attached to applications to open an authorized report or download, so that a static 404 path is never presented as a real artifact.
30. As a job seeker, I want missing Offer benefits, fund rates and probation terms to remain unknown, so that industry defaults do not become my personal Offer facts.
31. As a job seeker, I want clearly labeled tax and take-home estimates to use explicit assumptions, so that estimates remain useful without being mistaken for source evidence.
32. As a job seeker, I want guaranteed cash and non-guaranteed bonuses shown separately, so that the comparison does not present uncertain money as guaranteed annual compensation.
33. As a job seeker, I want “add to Offer comparison” to create one idempotent comparison member and open the Offer workspace, so that I can continue the comparison without an automatic evaluation or status change.
34. As a job seeker, I want application filters in the URL to survive refresh and navigation, so that the visible collection matches the requested status.
35. As a job seeker, I want interview rounds stored as structured events, so that round, time, contact and location remain visible after refresh.
36. As a job seeker, I want a follow-up reminder to create a durable reminder or event, so that a success response cannot hide a no-op.
37. As a job seeker, I want duplicate report linking to preserve my existing interview stage, so that deduplication cannot downgrade progress.
38. As a job seeker, I want analytics to show current-stage distribution as the primary view, so that rejected or abandoned applications cannot be counted as Offers by array order.
39. As a job seeker, I want a separate historical funnel to use only recorded stage events, so that missing historical evidence is shown as insufficient data.
40. As a job seeker, I want rejection reasons to be based on real evidence, so that the product never invents reason counts from a fixed ratio.
41. As a job seeker, I want an “all time” analytics range to include records older than eight weeks, so that the label and chart match the selected period.
42. As a job seeker, I want weekly reports to use only records inside their stated period, so that an old application is not presented as this week’s activity.
43. As a job seeker, I want API read failures to look different from empty data, so that I know whether to retry or whether there is genuinely nothing to show.
44. As a job seeker, I want memory retrieval to fall back to governed structured or lexical facts when embeddings fail, so that an existing preference is not falsely described as absent.
45. As a job seeker, I want memory candidates, active facts and deleted facts to remain correctly separated during a read failure, so that a failure cannot activate or resurrect information.
46. As a job seeker, I want salary statements to receive sensitive-content classification and a purpose confirmation, so that a salary preference is not activated without consent.
47. As a job seeker, I want a memory correction to invalidate the old fact and activate a sourced replacement atomically, so that a database error cannot leave a misleading half-update.
48. As a job seeker, I want a job scan to use the company set I confirmed, so that the worker does not silently expand it to a default list.
49. As a job seeker, I want an oversized attachment to explain its rejection, so that a file is not silently discarded.
50. As a job seeker, I want a delete or unsaved-change dialog to remain usable, so that cancelling does not white-screen the page and confirming changes only the intended entity.
51. As a job seeker, I want invalid session links to show a clear 400/404 state, so that an old valid conversation is not displayed as the invalid target.
52. As a job seeker, I want logout and account switching to isolate local drafts, applications, exports and stories, so that the next account cannot see the previous account’s private data.
53. As a job seeker, I want ownerless legacy local data preserved in an isolated recovery area, so that upgrading does not destroy unsynced work or expose it to another account.
54. As a job seeker, I want valid zero skill proficiency to display as zero, so that zero is not confused with a missing value.
55. As a job seeker, I want an explicitly unlocked skill to remain unlocked after saving, so that a dirty form cannot overwrite my intent.
56. As a member, I want admin-only endpoints to return a clear authorization response, so that an ordinary permission failure is not rendered as an unexplained server error.
57. As a job seeker, I want salary settings to reject negative and reversed ranges, so that invalid preferences cannot persist.
58. As a job seeker, I want “clear local data” to clear every declared local business table only after completion, so that a success message does not leave hidden markers behind or delete server data.
59. As an administrator, I want destructive reference deletion to require a precise confirmation, so that a single accidental click cannot delete a material.
60. As a keyboard or screen-reader user, I want form controls, icon buttons and close actions to have accessible names and restored focus, so that I can complete the same flows without visual guessing.
61. As a mobile user, I want the CV, profile and composer controls to remain inside the viewport, so that long input and delete actions are reachable at 320–390px widths.
62. As a user, I want the composer to grow within the available viewport and scroll internally, so that the send action stays reachable while editing 30 or more lines.
63. As a user, I want streaming, scrolling and navigation to preserve my reading position and release global scroll locks, so that an unrelated page cannot inherit Agent layout state.
64. As a user, I want a silent recording to produce no invented answer, so that ASR uncertainty cannot change my interview transcript.
65. As a user, I want browser audio-playback rejection to show a retry and text fallback, so that a TTS permission issue does not become a silent failure.
66. As a product owner, I want all 392 E2E specifications to have honest evidence, so that partial, blocked and not-run cases cannot be reported as passing.
67. As a release owner, I want immutable builds, versioned quality gates, canary checks and reversible migrations, so that a failed batch can be rolled back without overwriting newer data.

## Implementation Decisions

- The external behavior seam is authoritative. Unit and internal contract tests support it but cannot replace API, Worker, database, browser, refresh and independent read-back evidence.
- Run Admission, Run Continuation and Task Program remain the shared runtime boundaries. The model cannot create a new task phase by itself, and a browser message list is not the execution source of truth.
- The Worker remains the sole transcript writer. Attachment classification, image intake and error fallback must enter the durable transcript through the same continuation path as ordinary turns.
- The durable interview engine remains the sole writer of phase, question progression, control instructions, answer bindings and scoring artifacts. The question graph is a projection.
- Each Run Contract declares its actual user goal, allowed tools, required approvals, expected artifacts and completion facts. A successful tool result is consumed by the contract; a tool success alone is not Run success.
- Handoff and delegation preserve structured purpose, source artifact IDs, constraints and one stable delegation identity. Delegated research remains read-only and the parent must consume structured findings.
- Cross-goal handoff creates a new Run through Run Admission; same-goal specialist handoff remains in the existing Run. Every handoff/delegation records explicit user authorization, and required child failures leave the parent waiting while supporting child omissions produce an explicit limitation rather than false completion.
- All user-visible conclusions that contain personal facts carry provenance categories: user-stated, verified task fact, hypothesis or example. Career-positioning output shows a concise source label and an expandable evidence view.
- The server-side resume document remains the canonical source. Import, optimization, proposal application, rollback and reference-resume saving use version, hash, source artifact and owner checks with read-back verification.
- Resume factuality and unsupported-number vetoes remain hard gates. If evidence is insufficient, the product preserves the source, asks for evidence or produces an advisory result; it does not lower the gate to make generation appear successful.
- ADR-0041 remains authoritative: deterministic number provenance and factuality vetoes are hard; resume faithfulness LLM scores are soft and low/unavailable scores demote a proposal to advisory-only. The versioned task-risk matrix must define `taskType × rubric × threshold × missing/error action`; a missing Judge result cannot silently pass a blocking task.
- Reference-resume saving binds the approved request to a pending source artifact and source hash. If verification fails after a write, the operation reconciles or removes the created row and reports the actual side effect.
- Offer fields for absent social insurance, fund rate and probation remain nullable/unknown. Guaranteed cash, variable or non-guaranteed bonus, source evidence and calculation assumptions are separate projections.
- The Offer comparison entry creates an idempotent comparison member for the selected application and navigates to the Offer workspace. It does not evaluate automatically and does not change application status.
- Analytics uses current-stage distribution as the primary view. Historical arrival is a separate event-backed view; missing events produce an explicit insufficiency state.
- Browser local data uses an owner namespace. Legacy records without reliable ownership move to an isolated recovery area and stop feeding normal pages; only evidence-backed matches migrate automatically.
- Error, empty, loading and unavailable are separate states for reports, CV, analytics, memory, enterprise news and interview readiness. A failed read cannot enable a flow that requires the missing material.
- The release process has six internal batches: B0 safety/runtime infrastructure and legacy-run migration, B1 P0 context, B2 core business writes, B3 cross-page delivery, B4 experience/media, and B5 full acceptance plus the single formal production cutover required by ADR-0022. B0–B4 are isolated/preview validation only; each batch has an immutable build, migration manifest, evidence manifest, canary and rollback package.
- Historical patches are read-only scanned first. Only evidence-sufficient, reversible synthetic/test records may be corrected automatically. Real-user records always require item-level confirmation; deterministic source evidence may support a reversible candidate but never bypass confirmation. Uncertain records remain `needs_review`.
- Quality gates use versioned task-specific rubrics. Existing blocking and advisory thresholds are starting values and must be calibrated on fixed fixtures; no runtime path may silently lower them.
- Database and provider fault injection is isolated to BROWSER-MOCK/FAULT environments. Production validation uses safe canary paths and never injects provider, worker or database failures globally.

## Testing Decisions

- A good test observes external behavior: the user-visible answer or state, the actual tool/provider request, the authoritative entity, independent read-back, refresh/reconnect behavior and prohibited side effects. A button click, HTTP 200, tool `success`, screenshot or model self-report is insufficient.
- Deterministic facts such as owner, ACL, status, count, numeric calculation, hash, version, event identity and idempotency are judged by independent code or fixed expected values, never by another model.
- Generated text is judged for source fidelity, task relevance, constraint compliance, uncertainty disclosure and actionability. A quality Judge is supplementary and versioned; it cannot override a deterministic security, persistence, source or factuality failure.
- The 67 User Stories are thematic outcomes, not a one-to-one replacement for the 67 issue rows. The remediation matrix remains normative; the final manifest must carry `issueId`, `storyIds` (or an explicit `matrix-only` reason), all referenced AC/PG IDs, owner package, fixture and oracle so merged stories cannot hide an issue.
- The Runtime / AgentChat suite extends the existing admission, continuation, task-runtime, journey, projection, interview, memory and quality-eval assets. It covers all 12 user-reachable task types; the system-only `job_digest` is covered by its scheduler/delivery cases. It also covers applicable lifecycle flows, multi-turn correction, pause/resume, handoff, delegation, attachments, image purpose binding, Offer follow-up, voice, MCP and the two isolated not-run fault fixtures.
- The service-entity suite covers API integration against isolated PostgreSQL and file stores. It verifies transactions, read-back, owner filtering, migrations, nullable unknown Offer fields, CV version/hash, reference source hashes, application events, analytics windows, memory governance and historical patch dry-runs.
- The browser suite uses real Chromium at desktop and narrow widths, both themes, keyboard paths, refresh, back/forward, new browser context and controlled response/provider failures. It verifies composer scrolling, global scroll-lock release, focus return, labels, dialogs, audio fallback, report unreadable states and account switching.
- BROWSER-MOCK and FAULT suites inject invalid model JSON/DSML/unknown tools, provider errors, database failure after write, worker lease takeover, SSE loss, duplicate requests, stale versions and post-generation save failure. These fixtures are isolated and must preserve evidence of both the attempted effect and the final entity.
- The runtime preflight proves ADR-0026 invariants before any release gate: `AGENT_RUNTIME_MODE=worker_all`, no reachable client/remote/direct legacy executor, legacy endpoints reject by contract, and the Worker is the only execution owner. The dynamic MCP manifest (server, tool, capability, risk, allowlist, version) is diffed against the fixture manifest; additions/removals require explicit coverage or an approved blocker.
- Every original 392 specification receives a manifest entry with applicable parameters, fixture version, layer, first result, retry result, evidence links and final status. The final gate requires every applicable case to execute and pass; N/A is reserved for a manifest-approved inapplicable case, never for missing infrastructure. AC-RUN-016 and AC-EXT-010 are applicable and must run in isolated FAULT/BROWSER-MOCK fixtures. Partial, blocked and not-run remain explicit until their prerequisite is executed.
- The 55-tool registry receives an explicit coverage cross-check. Each applicable tool must have request evidence, result consumption, independent read-back or a documented isolated fixture blocker; the 14 tools with no result in the baseline cannot be silently treated as covered.
- ADR-0029 migration is a release gate: nonterminal legacy Runs retain their original runId and owner/conversation binding, advance only from persisted evidence, and enter a safe paused state with an actionable explanation when revalidation cannot establish a required fact. Migration records and rollback/read-back evidence are required before B0 closes.
- The permanent regression set must include the five P0 issues, the recurring scroll/context failures, owner isolation, source mismatch, unknown Offer fields, stale CV versions, memory embedding degradation, contract false success, and all observed tool-result consumption failures.
- Memory governance regressions include user-confirmed scope and cross-layer read-back for targeted erasure, retention of source records, candidate expiry/closed extraction, volatile preference review, and inferred-to-pending migration; a single Postgres or session-layer assertion is insufficient.
- Prior art includes the existing deterministic Agent evals, resume factuality evals, memory eval harness, projection tests, journey tests, PostgreSQL fault script, browser example suite, production coverage manifest and release-gate aggregation. The new spec extends their seams instead of creating parallel state machines.

## Out of Scope

- No automatic correction of real-user history without item-level confirmation; deterministic source evidence may support a reversible review candidate but cannot replace confirmation.
- No deletion of ownerless legacy browser data during the migration; it remains isolated until a recovery decision.
- No broad redesign of the homepage, visual brand or artwork beyond the layout, state, accessibility and interaction fixes required by these failures.
- No continuous streaming ASR, automatic voice interruption, voice scoring, phone interviews or multi-speaker interviews.
- No unrestricted autonomous multi-agent swarm, cross-user data sharing or delegated write tools.
- No production-wide database, worker, provider or MCP fault injection.
- No claim that the original 392-item audit passed; the historical snapshot remains immutable and the new Eval Run reports its own evidence.
- No change to the user’s approved task scope merely to make a task appear complete.

## Further Notes

- The complete implementation plan and issue-to-test mapping remain in the remediation plan and 67-row matrix. This spec is the implementation-facing synthesis; the evidence audit remains the source for the original reproduction details.
- The first safety gate is B0; the first functional gate is the P0 context batch. B5 is the only formal production cutover. A later internal batch cannot advance while any P0 remains open or while its independent read-back evidence is missing.
- Historical scans must produce an exportable impact list with stable record IDs, old/new hashes, source evidence, operator, approval scope and rollback action.
- The issue should be labeled `ready-for-agent` only after the three external seams are accepted as the implementation boundary. No business code is changed by publishing this spec.
