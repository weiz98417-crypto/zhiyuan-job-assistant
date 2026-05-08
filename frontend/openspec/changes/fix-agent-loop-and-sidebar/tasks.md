## 1. prompt.ts — 删除 `<<PLAN>>`

- [x] 1.1 删除规则 2 "复杂任务先出计划"
- [x] 1.2 删除 `<<PLAN>>` 格式说明段落
- [x] 1.3 删除示例 2 "多步计划"（JD 分析的 PLAN 示例）
- [x] 1.4 ReAct 反思协议中去掉 `<<PLAN>>` 相关引用

## 2. client-runner.ts — 删除 Plan 代码，精简 ReAct 循环

- [x] 2.1 删除 `parsePlan` 和 `parsePlanJSON` 函数
- [x] 2.2 删除 `runQualityGateClient` 函数及相关 import 使用
- [x] 2.3 删除 `state.tasks` / `currentTaskIndex` 相关状态和 plan_created/task_started/task_done yield
- [x] 2.4 删除 `streamFromThinkProxy` fallback（no text 时的备用流式请求）
- [x] 2.5 删除 `LoopState` 类型中 tasks/currentTaskIndex/quality gate 相关字段（如不再使用）

## 3. page.tsx + AgentChat.tsx — 删除 PlanCard 和 thinkingContent

- [x] 3.1 `page.tsx` 删除 `planState` 状态和 plan_created/task_started/task_done 事件处理
- [x] 3.2 `page.tsx` 删除 AgentChat 的 `planState` prop 传递
- [x] 3.3 `page.tsx` 侧边栏 wrapper 添加 `overflow-hidden`，宽度 `w-[280px]` 改为 `w-[260px]`
- [x] 3.4 `AgentChat.tsx` 删除 `planState` prop、PlanCard 引用和渲染，保留 thinkingContent/ReflectingIndicator/ThinkingBubble
- [x] 3.5 清理 `page.tsx` 和 `AgentChat.tsx` 中不再使用的 import

## 4. Verify

- [x] 4.1 `npx tsc --noEmit` — 0 errors
- [x] 4.2 `npm run build` — 通过
