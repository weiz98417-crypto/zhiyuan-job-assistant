## Context

`agent-loop-infrastructure` 将在服务端新增 `plan_created`、`task_started`、`task_done` 三种 SSE 事件。当前 `agent-conversational` 的 Phase 可视化只处理 5 种事件（phase / tool_call / tool_result / text / done），不认识计划相关事件。需要在 `page.tsx` 的 SSE 解析器中处理新事件，并新增 PlanCard 组件渲染执行计划。

约束：(1) 复用现有 SSE buffer + split 解析框架，(2) PlanCard 作为消息流中的特殊消息类型插入，(3) 不影响探索模式（探索模式不产生计划事件），(4) 保持现有 Phase 可视化不变。

## Goals / Non-Goals

**Goals:**
- 新增 PlanCard + TaskItem 组件，渲染 Agent 的执行计划
- 扩展 SSE 解析器处理 plan_created / task_started / task_done
- PlanCard 实时更新：任务状态从 pending → in_progress → done
- 计划卡片位于消息流顶部（assistant 消息之前），随新消息自动滚入视野

**Non-Goals:**
- 不做 Plan-First 审批 UI（用户确认后才执行）
- 不做计划历史回放
- 不做计划导出/分享
- 不做拖拽排序任务

## Decisions

### 1. PlanCard 在消息流中的位置

```
消息列表布局：
┌──────────────────────────────────────┐
│ 用户: "分析投递情况并推荐岗位"       │
├──────────────────────────────────────┤
│ ┌────────────────────────────────┐   │
│ │ 📋 Agent 执行计划      2/4     │   │  ← PlanCard（assistant 类消息）
│ │ ✅ 查询投递  找到 8 条         │   │
│ │ ✅ 分析状态  3 条需跟进        │   │
│ │ 🔄 获取推荐  正在执行...       │   │
│ │ ⬜ 生成报告                    │   │
│ └────────────────────────────────┘   │
├──────────────────────────────────────┤
│ 纸鸢: 根据前两步的结果，现在获取...  │  ← assistant 文本消息
├──────────────────────────────────────┤
│ 📊 get_recommendations               │  ← 工具结果卡片
│ 获取到 2 个推荐岗位                  │
├──────────────────────────────────────┤
│ 纸鸢: 综合分析如下...               │  ← assistant 最终回复
└──────────────────────────────────────┘
```

**PlanCard 作为 agent 消息类型（非 tool 消息）插入。** 避免与现有 tool 消息渲染冲突。

### 2. PlanCard 状态管理

PlanCard 不在 messages 数组里——它有自己的独立状态：

```typescript
interface PlanState {
  title: string;          // "分析投递情况并推荐岗位"
  tasks: TaskState[];     // 任务列表
}

interface TaskState {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  summary?: string;       // 完成后的简短摘要
}
```

**为什么独立于 messages？** PlanCard 是实时更新的——一个任务完成后立即变 ✅。如果放在 messages 数组里，每次更新都要重新创建整个数组对象，与 React 的不可变更新模式冲突。独立状态更高效。

### 3. SSE 事件处理扩展

在现有 `sendMessage` 的 switch 语句中新增三个 case：

```
plan_created → setPlanState({ tasks: event.tasks.map(t => ({...t, status:"pending"})) })
task_started → update task status → "in_progress"
task_done    → update task status → "done" + summary
```

**探索模式忽略计划事件**——探索模式的服务端不产生这些事件。

### 4. 组件设计

```
PlanCard
├── 标题栏: 计划标题 + 进度 (N/M)
├── TaskItem 列表:
│   ├── 状态图标 (⬜/🔄/✅)
│   ├── 任务名称
│   └── 完成摘要（仅 done 状态）
└── 底部进度条
```

**TaskItem 动画：**
- pending → in_progress: 淡入旋转图标
- in_progress → done: 图标从 🔄 变为 ✅，带短暂绿色脉冲
- done 时 summary 文字从下方滑入

### 5. PlanCard 生命周期

```
plan_created 事件 → PlanCard 出现（所有任务 pending）
task_started  事件 → 第一项变 in_progress + 🔄
task_done     事件 → 第一项变 done + ✅ + 摘要
task_started  事件 → 第二项变 in_progress + 🔄
...
最后一个 task_done → PlanCard 所有项 done
done 事件        → 整个流结束，PlanCard 保留在界面上
```

**PlanCard 始终可见**——不会因为后续消息滚动而消失。它位于消息流中，和普通消息一样随滚动移动。

## Risks / Trade-offs

- [PlanCard 与消息列表的滚动] PlanCard 是独立元素，需要正确处理自动滚动 → 缓解：PlanCard 变化也触发 scrollIntoView
- [plan_created 解析失败] JSON 格式错误 → 缓解：静默降级，不显示 PlanCard，Agent Loop 继续执行
- [任务过多] 10+ 任务的计划会让 PlanCard 很高 → 缓解：Planner 限制最多 5 个任务，超过的合并为"其他"

## Open Questions

- PlanCard 完成后是否折叠为摘要？还是保持展开？（建议：完成后 3 秒自动折叠为一行摘要，用户可点击展开）
