## Why

1. Prompt 要求 LLM 对多步任务输出 `<<PLAN>>` 标签，LLM 输出 Plan 后未附带 Tool 时 client-runner 直接进入 respond 退出。Plan 模式本身是错误的设计——预测式多步计划在第一步结果回来后就可能失效，不如 ReAct 每步基于实际观察动态决策。
2. SessionList 侧边栏 280px 偏宽，wrapper 缺少 `overflow-hidden`，与主对话区重叠。

## What Changes

- **prompt.ts** — 移除 `<<PLAN>>` 全部内容（规则2、格式说明、示例2），只保留 `<<TOOL>>` 和 ReAct 反思协议
- **client-runner.ts** — 移除 Plan 解析逻辑（parsePlan、plan_created、task_started/done、quality gate），精简 loop 为纯 Think → Tool → Observe → 下一轮
- **page.tsx** — 移除 plan_created/task_started/task_done 事件处理、PlanState 状态和 PlanCard 渲染；侧边栏加 overflow-hidden 并收窄到 260px
- **AgentChat.tsx** — 移除 planState prop 和 PlanCard 引用；移除 ReflectingIndicator 和 thinkingContent prop

## Capabilities

### New Capabilities
- `react-agent-loop`: 纯 ReAct 循环 — 每轮 LLM 基于上一步观察动态决定下一步 tool 或 respond，不依赖预先计划
- `sidebar-layout`: 侧边栏 260px + overflow-hidden 约束

### Modified Capabilities
<!-- None -->

## Impact

- `src/lib/agent/prompt.ts` — 删除 `<<PLAN>>` 相关内容
- `src/lib/agent/loop/client-runner.ts` — 删除 Plan 解析、task 状态机、quality gate
- `src/app/agent/page.tsx` — 删除 Plan 相关 state/event 处理；sidebar className 调整
- `src/components/agent/AgentChat.tsx` — 删除 planState prop、PlanCard、ReflectingIndicator
- `src/components/agent/PlanCard.tsx` — 不再被 AgentChat 引用（文件保留但无引用）
