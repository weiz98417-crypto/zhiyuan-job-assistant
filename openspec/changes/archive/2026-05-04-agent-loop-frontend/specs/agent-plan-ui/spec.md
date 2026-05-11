## ADDED Requirements

### Requirement: PlanCard 组件

前端 SHALL 提供 PlanCard 组件，渲染 Agent 产生的执行计划。

#### Scenario: PlanCard 出现

- **WHEN** 客户端收到 `plan_created` SSE 事件
- **THEN** PlanCard 在消息列表中渲染
- **AND** 所有任务初始状态为 pending
- **AND** 显示计划标题和总任务数

#### Scenario: 任务状态更新

- **WHEN** 收到 `task_started` 事件
- **THEN** 对应任务在 PlanCard 中显示为 in_progress（🔄 图标）
- **WHEN** 收到 `task_done` 事件
- **THEN** 对应任务显示为 done（✅ 图标 + 摘要文字）

#### Scenario: 进度显示

- **WHEN** PlanCard 中有任务状态变化
- **THEN** 标题栏显示 "N/M 完成" 进度文字
- **AND** 底部进度条随之更新

#### Scenario: 全部完成

- **WHEN** 所有任务状态变为 done
- **THEN** PlanCard 保留显示
- **AND** 3 秒后可选自动折叠为摘要行

### Requirement: TaskItem 组件

每个任务 SHALL 以 TaskItem 组件渲染，显示状态图标、标题和完成摘要。

#### Scenario: pending 状态

- **WHEN** 任务尚未开始
- **THEN** 显示灰色 ⬜ 图标
- **AND** 任务文字为正常字重

#### Scenario: in_progress 状态

- **WHEN** 任务正在执行
- **THEN** 显示旋转动画的 🔄 图标
- **AND** 任务文字加粗
- **AND** 该行背景轻微高亮

#### Scenario: done 状态

- **WHEN** 任务已完成
- **THEN** 显示绿色 ✅ 图标，带短暂脉冲动画
- **AND** 摘要文字从下方滑入
- **AND** 任务文字恢复常规字重

### Requirement: PlanCard 与消息流的关系

PlanCard SHALL 作为消息流中的独立元素存在，不干扰普通消息渲染。

#### Scenario: PlanCard 位于 assistant 消息之前

- **WHEN** PlanCard 渲染
- **THEN** 它位于触发计划的用户消息和首个 assistant 回复之间
- **AND** 不与工具结果卡片混淆

#### Scenario: 无计划时不显示

- **WHEN** Agent Loop 不产生 `plan_created` 事件
- **THEN** PlanCard 不渲染
- **AND** 消息流保持当前行为不变

#### Scenario: 探索模式不显示

- **WHEN** 用户位于探索 Tab
- **THEN** PlanCard 永不出现
- **AND** 收到 plan 事件静默忽略
