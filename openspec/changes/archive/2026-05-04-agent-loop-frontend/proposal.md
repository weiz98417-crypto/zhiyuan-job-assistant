## Why

`agent-loop-infrastructure` 让 Agent 有了多步推理和计划拆解能力，但当前前端只能渲染"思考→执行→回复"三种 Phase。Agent Loop 产生的新事件类型（plan_created、task_started、task_done）前端完全不认识。用户看不到 Agent 的计划和执行进度——只能盯着一行行文字等结果。需要让 Agent 的执行过程像 Claude Code 一样结构化可见：计划卡片、任务列表、逐项完成状态。

## What Changes

- **新增 PlanCard 组件** (`src/components/agent/PlanCard.tsx`)：显示 Agent 拆解的任务计划，带进度条和状态图标
- **新增 TaskItem 组件** (`src/components/agent/TaskItem.tsx`)：单个任务行，⬜ 待执行 / 🔄 执行中 / ✅ 已完成，完成项显示摘要
- **SSE 事件解析扩展**：`page.tsx` 新增 `plan_created`、`task_started`、`task_done` 三种事件处理
- **AgentChat 适配**：支持在消息流中插入 PlanCard，置于消息列表顶部或工具消息之间

## Capabilities

### New Capabilities
- `agent-plan-ui`: Agent 计划可视化 — PlanCard + TaskItem 组件，显示计划条目和逐项执行进度
- `sse-task-events`: SSE 任务事件支持 — 客户端解析 plan_created/task_started/task_done 并驱动 UI 更新

### Modified Capabilities
- `agent-phase-visualization`: Phase 状态机扩展，新增 plan 阶段的任务进度追踪状态

## Impact

- **新增**: `src/components/agent/PlanCard.tsx`、`src/components/agent/TaskItem.tsx`
- **修改**: `src/app/agent/page.tsx` — sendMessage 新增 plan/task 事件处理 + 状态管理
- **修改**: `src/components/agent/AgentChat.tsx` — 消息列表中插入 PlanCard 渲染
- **依赖**: `agent-loop-infrastructure`（提供 SSE 事件定义和 Loop 引擎）
