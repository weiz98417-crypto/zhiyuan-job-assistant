## 1. Tool Plugin System

- [x] 1.1 Create `tools/types.ts` — ToolDefinition interface (name, description, category, parameters, handler, formatResult), ToolParameter, ToolResult types
- [x] 1.2 Create `tools/registry.ts` — ToolRegistry class with register(target), get(name), getByCategory(category), buildToolListText(), execute(name, params)
- [x] 1.3 Create `tools/index.ts` — import + register all existing tools, export registry singleton and convenience re-exports (executeTool, formatToolResult, buildToolListForLLM)
- [x] 1.4 Extract `search_applications` to `tools/query/search-applications.ts` as standalone ToolDefinition
- [x] 1.5 Extract `get_report_detail` to `tools/query/get-report-detail.ts` as standalone ToolDefinition
- [x] 1.6 Extract `get_recommendations` to `tools/query/get-recommendations.ts` as standalone ToolDefinition
- [x] 1.7 Extract `evaluate_jd` to `tools/action/evaluate-jd.ts` as standalone ToolDefinition
- [x] 1.8 Extract `evaluate_offer` to `tools/action/evaluate-offer.ts` as standalone ToolDefinition
- [x] 1.9 Extract `generate_cv` to `tools/action/generate-cv.ts` as standalone ToolDefinition
- [x] 1.10 Extract `scan_portals` to `tools/action/scan-portals.ts` as standalone ToolDefinition
- [x] 1.11 Extract `get_pipeline_status` to `tools/query/get-pipeline-status.ts` as standalone ToolDefinition
- [x] 1.12 Remove old `tools.ts`, verify all imports updated to new `tools/index.ts`
- [x] 1.13 Verify backward compatibility — `executeTool(name, params)`, `buildToolListForLLM()` return same format

## 2. Agent Loop Engine

- [x] 2.1 Create `src/lib/agent/loop/types.ts` — LoopConfig, LoopState, LoopEvent, TaskContext types
- [x] 2.2 Create `src/lib/agent/loop/runner.ts` — AgentLoop class with async generator `run(input, context)` yielding typed events
- [x] 2.3 Implement Think phase — LLM call with system prompt + tools + conversation, return llmResponse and next action decision
- [x] 2.4 Implement Act phase — parse `<<TOOL>>...<</TOOL>>` from LLM response, call registry.execute, capture result
- [x] 2.5 Implement Observe phase — format tool result as context message for next iteration
- [x] 2.6 Implement loop termination conditions: all tasks done / maxIterations reached / consecutive failures / no tool call
- [x] 2.7 Implement context budget protection — truncate early messages when approaching token limit, keep last 15 messages
- [x] 2.8 Implement Quality Gate — before final respond, self-check: answers all questions? data-backed? concrete advice?

## 3. Task Planner

- [x] 3.1 Create `src/lib/agent/loop/planner.ts` — TaskPlanner with `plan(request, context)` → Task[]
- [x] 3.2 Implement `<<PLAN>>` marker parsing — extract JSON array from LLM response, handle parse errors gracefully
- [x] 3.3 Implement single-task shortcut — simple requests produce 1 task, no overhead
- [x] 3.4 Implement task limit enforcement — max 5 tasks, overflow merged into "其他"
- [x] 3.5 Implement plan title extraction — derive ≤20 char title from user request
- [x] 3.6 Integrate Planner into AgentLoop.run() — plan first, then execute tasks sequentially

## 4. SSE Event Extension

- [x] 4.1 Define new SSE event types — plan_created, task_started, task_done in SSE event type union
- [x] 4.2 Emit `plan_created { tasks: [...] }` event when Planner produces a plan
- [x] 4.3 Emit `task_started { taskId }` event when beginning each task
- [x] 4.4 Emit `task_done { taskId, summary }` event when completing each task
- [x] 4.5 Ensure explore mode never emits plan/task events

## 5. API Route Integration

- [x] 5.1 Update `src/app/api/agent/chat/route.ts` execute mode branch to use AgentLoop instead of single-shot tool call
- [x] 5.2 Wire SSE event stream from AgentLoop generator through route handler response
- [x] 5.3 Inject tool list into execute mode system prompt via registry.buildToolListText()
- [x] 5.4 Ensure explore mode pathway unchanged (direct stream, no loop, no tools)

## 6. Verification

- [x] 6.1 TypeScript check — 0 errors across all new and modified files
- [x] 6.2 `next build` passes with new loop/ and tools/ directories
- [ ] 6.3 Manual test: simple request (单步) — Planner outputs 1 task, Loop executes in 1 iteration
- [ ] 6.4 Manual test: multi-step request — Planner outputs 3-5 tasks, Loop iterates through all with plan_created/task_started/task_done events emitted
- [ ] 6.5 Manual test: explore mode — no plan/task events, direct streaming unchanged
- [ ] 6.6 Manual test: tool failure — consecutive failures skip task, loop continues
