## 1. Data Model And Repository Foundation

- [x] 1.1 Add `application_events` schema to SQLite and Postgres with user isolation, application id, event type, status transition fields, source, note, metadata, and timestamps.
- [x] 1.2 Add optional `application_tasks` schema to SQLite and Postgres if task persistence is implemented in this change; otherwise document it as deferred.
- [x] 1.3 Extend `AppRow` and related row mapping to carry normalized status plus optional `jd_id`, `source_url`, and metadata-compatible fields where supported by current schema.
- [x] 1.4 Extend `DataRepositories.applications.list` filters to support `role`, `score_min`, `date_from`, id/report/JD lookup where needed.
- [x] 1.5 Add repository methods for application status update with read-back and event insertion.
- [x] 1.6 Add repository methods to list application events for a single application under the current user.
- [x] 1.7 Normalize historical status values in read/write helpers without requiring a destructive migration.

## 2. Application Workflow Module

- [x] 2.1 Create `src/lib/application-workflow.ts` with `trackApplication`, `updateApplicationStatus`, `getApplicationContext`, and `suggestNextActions`.
- [x] 2.2 Implement application deduplication by current user plus normalized company and role, preserving existing record identity.
- [x] 2.3 Implement write read-back verification for track and status update operations.
- [x] 2.4 Implement event creation for initial tracking and status transitions.
- [x] 2.5 Implement next-action suggestions for evaluated, applied, responded, interview, offer, rejected, discarded, and skip states.
- [x] 2.6 Implement multiple-candidate handling for ambiguous application context lookup.

## 3. Data API Upgrade

- [x] 3.1 Update `GET /api/data/applications` to honor `role`, `score_min`, `date_from`, `limit`, and `offset` consistently.
- [x] 3.2 Route application POST writes through `ApplicationWorkflow.trackApplication`.
- [x] 3.3 Add a status update route or PATCH behavior that calls `ApplicationWorkflow.updateApplicationStatus`.
- [x] 3.4 Ensure application write/update responses include read-back `data`, `created/updated`, and event evidence where applicable.
- [x] 3.5 Add application context/event retrieval route or reusable server helper for Agent tools.
- [x] 3.6 Preserve authentication and user isolation for all application API paths.

## 4. Agent Pipeline Tools

- [x] 4.1 Add `track_application` tool under `src/lib/agent/tools/action` or a suitable Pipeline action location.
- [x] 4.2 Add `update_application_status` tool with normalized status validation and ambiguous-match handling.
- [x] 4.3 Add `get_application_context` query tool for reading application, linked materials, events, and next actions.
- [x] 4.4 Register new tools in `src/lib/agent/tools/index.ts`.
- [x] 4.5 Add Chinese display names for new tools.
- [x] 4.6 Add tool governance metadata with verified write/read-back requirements for write tools.
- [x] 4.7 Update agent prompt/routing instructions so explicit tracking intents call Pipeline tools instead of replying with generic advice.
- [x] 4.8 Ensure tool failures are surfaced as failures and are not converted into fabricated success messages.

## 5. AgentChat And Result Card Integration

- [x] 5.1 Render a compact success result when `track_application` adds or updates an application.
- [x] 5.2 Render a compact success result when `update_application_status` changes status.
- [x] 5.3 Add Chat actions from JD/evaluation/discovery cards for “加入追踪”, “标记已投递”, and “准备面试” where context is available.
- [x] 5.4 Ensure ambiguous application matches ask for clarification instead of mutating an arbitrary record.
- [x] 5.5 Verify AgentChat route/session state does not repeat the same Pipeline write when the user switches pages and returns.

## 6. Tracker Page Upgrade

- [x] 6.1 Change `src/app/tracker/page.tsx` to load applications from `/api/data/applications` as the primary source.
- [x] 6.2 Replace direct `db.applications.update/add` status changes with service calls to the Pipeline update API.
- [x] 6.3 Refresh UI from read-back application records after successful changes.
- [x] 6.4 Add visible error and retry states for API failures.
- [x] 6.5 Add next-action affordances per state:投递、跟进、准备面试、复盘、谈薪、放弃.
- [x] 6.6 Keep existing list/grouped/Kanban views functional after service-backed loading.

## 7. Replace Scattered Tracking Writes

- [x] 7.1 Update `AgentEvalCard` to use the Pipeline API/tool path instead of writing Dexie directly.
- [x] 7.2 Update evaluation reports page “加入追踪” to use the Pipeline API path and read-back response.
- [x] 7.3 Update report save flow so `actions.addToTracker` uses `ApplicationWorkflow.trackApplication`.
- [x] 7.4 Update job discovery result actions to add discovered jobs to Pipeline through the workflow.
- [x] 7.5 Preserve original JD URLs and report/JD references when adding records from reports or discovery.
- [x] 7.6 Remove or quarantine duplicate local-only tracking logic that can diverge from server state.

## 8. Team Insights Upgrade

- [x] 8.1 Expand `TeamInsights` type to include `overview`, `pipelineFunnel`, `marketSignals`, `bottlenecks`, `agentQuality`, `sharedAssets`, and `actionRecommendations`.
- [x] 8.2 Implement SQLite aggregation for the expanded team insights payload.
- [x] 8.3 Implement Postgres aggregation for the expanded team insights payload with matching semantics.
- [x] 8.4 Compute Pipeline funnel from applications, reports, JDs, offers, and discovery data where available.
- [x] 8.5 Compute market signals including direction/archetype, source distribution, average score, and high-risk counts where data exists.
- [x] 8.6 Compute bottlenecks for high-score-not-applied, applied-no-response, interview-no-retro, offer-needs-negotiation, and risky-JD-followup cases.
- [x] 8.7 Compute Agent quality signals from existing agent run/review/tool data where available, with graceful empty states.
- [x] 8.8 Compute shared asset reuse and asset gap summaries from reference resume/JD/report data where available.
- [x] 8.9 Redesign `src/app/admin/insights/page.tsx` to show the expanded dashboard without exposing private raw content.
- [x] 8.10 Preserve admin-only access and clear empty states.

## 9. Personal Analytics Alignment

- [x] 9.1 Update personal analytics calculations to use normalized Pipeline status values.
- [x] 9.2 Align follow-up reminder logic with application events and server-side dates.
- [x] 9.3 Ensure personal analytics and team insights use the same stage definitions.

## 10. Baseline Evals

- [x] 10.1 Baseline: “把这个 JD 加进追踪” routes to `track_application` and returns read-back application evidence.
- [x] 10.2 Baseline: “这个岗位我投了” routes to `update_application_status` and records `applied` status plus event.
- [x] 10.3 Baseline: Tracker page shows an application created from AgentChat after reload.
- [x] 10.4 Baseline: Evaluation report “加入追踪” creates or updates the same server application record.
- [x] 10.5 Baseline: Team insights returns Pipeline funnel fields from seeded application/report/JD/offer data.

## 11. Boundary Evals

- [x] 11.1 Boundary: Missing company or role does not create an empty application and asks for clarification.
- [x] 11.2 Boundary: Ambiguous status update returns candidates and does not mutate a random record.
- [x] 11.3 Boundary: Duplicate company and role updates existing application instead of creating duplicate rows.
- [x] 11.4 Boundary: Historical `Evaluated` data is counted as `evaluated` in API, tracker, analytics, and team insights.
- [x] 11.5 Boundary: Non-admin user cannot access team insights.
- [x] 11.6 Boundary: Team insights empty states do not show mock data.

## 12. Regression Evals

- [x] 12.1 Regression: Existing `search_applications` still returns filtered records and now honors declared filters.
- [x] 12.2 Regression: Existing JD evaluation and report persistence flows still complete with read-back verification.
- [x] 12.3 Regression: Job discovery evaluation path still saves/reuses JD and can add to Pipeline without duplicate records.
- [x] 12.4 Regression: Offer and interview agent routes are not hijacked by Pipeline tools unless user intent is explicit.
- [x] 12.5 Regression: User isolation prevents application queries, events, and team aggregates from leaking private details.

## 13. Verification And Deployment Prep

- [x] 13.1 Run focused unit/integration tests for application workflow, API filters, and repository behavior.
- [x] 13.2 Run Agent tool governance/audit tests after adding new tools.
- [x] 13.3 Run UI smoke tests for AgentChat, Tracker, Reports, Discovery, Analytics, and Team Insights.
- [x] 13.4 Verify Postgres-backed behavior locally or through existing deployment database configuration.
- [x] 13.5 Update user-facing documentation or desktop planning doc if behavior changes are visible.
