## Context

当前 agent loop 混入了 `<<PLAN>>` 解析和 task 状态机，但实现不完整（task_started/done 从未 yield）。Plan 模式本质问题：LLM 提前预测的多步计划在第一步工具结果返回后常已过时，不如每轮 ReAct（Think → Act → Observe → Reflect）基于实际观察动态决策。

## Goals / Non-Goals

**Goals:**
- 纯 ReAct 循环：每轮 LLM 观察上一步结果后动态决定下一步（调 tool 或 respond）
- 移除 `<<PLAN>>` 及相关代码（prompt、client-runner、page.tsx、AgentChat）
- 侧边栏 260px + overflow-hidden

**Non-Goals:**
- 不改变 `<<TOOL>>` 协议格式
- 不改变 Tool 注册和执行机制
- 不新增 Agent 能力

## Decisions

### Decision 1: 纯 ReAct — 删除 Plan，不修复 Plan

Plan 模式被否决的原因：
- Plan 是预测式的，第一步结果可能推翻后续计划
- 需要复杂的状态机（task_started/done/currentTaskIndex）
- LLM 容易只输出 Plan 不输出 Tool
- Claude Code 等成熟 agent 都是 ReAct，每步动态决策

**方案**：完全删除 `<<PLAN>>` 相关内容，agent loop 保持现有的 Think → Tool → Observe → 下一轮结构。LLM 在每轮基于 `反思协议` 判断：数据够 → respond；数据不够 → 再调 tool。

### Decision 2: client-runner 精简

删除：
- `parsePlan()` / `parsePlanJSON()` 函数
- `state.tasks` / `currentTaskIndex` 状态
- `plan_created` / `task_started` / `task_done` yield 点
- `runQualityGateClient()` 和 quality gate 逻辑
- `streamFromThinkProxy` fallback（no text 时）

保留：
- `parseToolCall()` — 核心 `<<TOOL>>` 解析
- `extractThinkingContent()` — 思考内容提取
- ReAct 循环主体：Think → 解析 Tool → Execute → Observe → 下一轮

### Decision 3: prompt.ts — 只保留 `<<TOOL>>` 协议

删除：
- 规则 2 "复杂任务先出计划"
- `<<PLAN>>` 格式说明
- 示例 2（多步计划示例）
- ReAct 反思协议中的 `<<PLAN>>` 相关引用

保留：
- 规则 1 "能用工具就必须用"
- `<<TOOL>>` 格式说明和示例
- ReAct 反思协议（Observe + Reflect 判断逻辑）

### Decision 4: UI 层清理

- `page.tsx`: 删除 `planState`、`plan_created`/`task_started`/`task_done` handler、PlanCard 渲染 → AgentChat 不再传 `planState`
- `AgentChat.tsx`: 删除 `planState` prop、`PlanCard` import、`ReflectingIndicator`、`thinkingContent` prop、`ThinkingBubble` standalone 渲染

## Risks / Trade-offs

- [LLM 失去 Plan 结构可能调用顺序不佳] → ReAct 反思协议已覆盖 "数据不够再调" 逻辑
- [删除 thinkingContent 减少 UI 反馈] → thinking 阶段仍通过 ThinkingDots 和 phase 文本反馈；LLM 思考内容通常无需展示
