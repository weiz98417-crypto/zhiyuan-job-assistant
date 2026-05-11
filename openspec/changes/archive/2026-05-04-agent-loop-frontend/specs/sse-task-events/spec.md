## ADDED Requirements

### Requirement: SSE 事件扩展解析

客户端 SSE 解析器 SHALL 支持 `plan_created`、`task_started`、`task_done` 三种新事件类型。

#### Scenario: plan_created 事件处理

- **WHEN** 客户端收到 `{"type":"plan_created","tasks":[...]}`
- **THEN** 创建 PlanState 对象，所有任务 status 初始化为 pending
- **AND** PlanCard 组件立即渲染

#### Scenario: task_started 事件处理

- **WHEN** 客户端收到 `{"type":"task_started","taskId":"1"}`
- **THEN** 更新对应任务的 status 为 in_progress
- **AND** 不创建新消息

#### Scenario: task_done 事件处理

- **WHEN** 客户端收到 `{"type":"task_done","taskId":"1","summary":"找到 8 条"}`
- **THEN** 更新对应任务的 status 为 done 并附加 summary
- **AND** 不创建新消息

#### Scenario: 未知事件静默忽略

- **WHEN** 客户端收到未知 type 的事件
- **THEN** 不抛出错误
- **AND** 不影响流解析的继续

### Requirement: PlanState 管理

客户端 SHALL 使用独立状态管理 PlanCard 数据，不与 messages 数组混合。

#### Scenario: PlanState 初始化

- **WHEN** plan_created 事件到达
- **THEN** `setPlanState({ tasks: [...], title: "..." })`
- **AND** PlanState 与 messages 完全独立

#### Scenario: PlanState 更新

- **WHEN** task_started 或 task_done 事件到达
- **THEN** 使用不可变更新：`setPlanState(prev => ({...prev, tasks: prev.tasks.map(...)}))`
- **AND** 不触发 messages 数组的重新创建

#### Scenario: PlanState 清理

- **WHEN** 流结束（done 事件或异常）
- **THEN** PlanState 保留（用户可回顾），不清空
- **WHEN** 用户发送新消息
- **THEN** PlanState 重置为 null

### Requirement: 后向兼容

新增事件类型 SHALL 不影响探索模式和旧客户端。

#### Scenario: 探索模式不接收新事件

- **WHEN** 用户位于探索 Tab
- **THEN** 服务端不发送 plan/task 事件
- **AND** 客户端不尝试解析这些事件

#### Scenario: Phase 事件不变

- **WHEN** 新事件类型与现有 phase/tool_call/tool_result/text/done 混合发送
- **THEN** 现有 phase 可视化行为不受影响
- **AND** SSE 解析器的 switch 语句平滑扩展
