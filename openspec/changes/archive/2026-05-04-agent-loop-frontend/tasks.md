## 1. PlanState Types & Management

- [x] 1.1 Define PlanState and TaskState types in page.tsx (id, title, status: pending|in_progress|done, summary?)
- [x] 1.2 Add `planState` / `setPlanState` state hook in page.tsx, independent from messages array
- [x] 1.3 Implement PlanState reset — clear on new user message, retain on stream end

## 2. SSE Event Parsing Extension

- [x] 2.1 Extend SSEEvent type union in page.tsx — add plan_created, task_started, task_done
- [x] 2.2 Add `case "plan_created"` in sendMessage switch — setPlanState with tasks all pending
- [x] 2.3 Add `case "task_started"` in sendMessage switch — update matching task status to in_progress
- [x] 2.4 Add `case "task_done"` in sendMessage switch — update matching task status to done + attach summary
- [x] 2.5 Ensure unknown event types are silently ignored (no error thrown, stream continues)

## 3. PlanCard Component

- [x] 3.1 Create `src/components/agent/PlanCard.tsx` — PlanCard component receiving PlanState, rendering title + progress + task list + progress bar
- [x] 3.2 Implement title bar — show plan title + "N/M 完成" progress text
- [x] 3.3 Implement progress bar — animated width transition, fills left to right
- [x] 3.4 Implement auto-collapse — 3 seconds after all done, collapse to summary row; click to expand

## 4. TaskItem Component

- [x] 4.1 Create `src/components/agent/TaskItem.tsx` — TaskItem component receiving TaskState, rendering icon + title + summary
- [x] 4.2 Implement pending state — gray ⬜ icon, normal font weight
- [x] 4.3 Implement in_progress state — spinning 🔄 icon (Loader2), bold text, subtle highlight background
- [x] 4.4 Implement done state — green ✅ icon with short pulse animation, summary text slides in from below
- [x] 4.5 Handle summary absence — done tasks without summary show just icon + title

## 5. AgentChat Integration

- [x] 5.1 Pass planState to AgentChat as new prop
- [x] 5.2 Render PlanCard in message list — positioned between triggering user message and first assistant reply
- [x] 5.3 Ensure PlanCard only renders when planState is non-null
- [x] 5.4 Ensure PlanCard does NOT render in explore mode (mode check)
- [x] 5.5 Auto-scroll PlanCard into view on state changes (task status updates, plan creation)
- [x] 5.6 Verify PlanCard does not interfere with existing phase visualization (thinking/executing/responding)

## 6. Verification

- [x] 6.1 TypeScript check — 0 errors
- [x] 6.2 `next build` passes
- [ ] 6.3 Manual test: simple request — no plan_created event, PlanCard not rendered, normal flow unchanged
- [ ] 6.4 Manual test: multi-step request — PlanCard appears with all tasks pending, updates through in_progress → done as events arrive
- [ ] 6.5 Manual test: explore mode — plan events silently ignored, PlanCard never renders
- [ ] 6.6 Manual test: task status transitions animate correctly (pending → 🔄 → ✅ with green pulse)
- [ ] 6.7 Manual test: PlanCard auto-collapses 3 seconds after all tasks done
