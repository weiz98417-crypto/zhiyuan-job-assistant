## ADDED Requirements

### Requirement: 请求拆解

Task Planner SHALL 将复杂用户请求拆解为有序任务列表。

#### Scenario: 简单请求不拆解

- **WHEN** 用户请求只需要一步完成（如 "查一下投递记录"）
- **THEN** Planner 生成单个任务
- **AND** 不增加额外 LLM 调用

#### Scenario: 复杂请求拆解

- **WHEN** 用户请求涉及多个步骤（如 "分析投递情况并推荐岗位"）
- **THEN** Planner 生成 2-5 个有序任务
- **AND** 每个任务有明确的标题和可选关联工具

#### Scenario: 拆解失败回退

- **WHEN** LLM 输出的计划 JSON 格式错误
- **THEN** Planner 回退到无计划模式
- **AND** Agent Loop 正常执行，只是前端不显示 PlanCard
- **AND** 不阻塞用户请求

### Requirement: 计划输出格式

Planner SHALL 使用 `<<PLAN>>` 标记输出结构化计划。

#### Scenario: 计划格式

- **WHEN** LLM 完成计划拆解
- **THEN** 输出格式为 `<<PLAN>>\n[JSON数组]\n<</PLAN>>`
- **AND** JSON 数组中每项包含 id, title, tool（可选）

#### Scenario: 计划解析

- **WHEN** 服务端收到 LLM 响应包含 `<<PLAN>>` 标记
- **THEN** 解析 JSON 生成 Task[] 数组
- **AND** 发送 `plan_created` SSE 事件到客户端
- **AND** 计划文本从回复中移除（不显示给用户）

### Requirement: 任务逐项执行

Planner SHALL 按顺序逐项执行任务，每项完成后汇报进度。

#### Scenario: 任务开始

- **WHEN** 开始执行计划中的一项任务
- **THEN** 发送 `task_started { taskId }` SSE 事件
- **AND** 当前任务状态变为 in_progress

#### Scenario: 任务完成

- **WHEN** 完成任务所需的工具调用和思考
- **THEN** 发送 `task_done { taskId, summary }` SSE 事件
- **AND** 当前任务状态变为 done
- **AND** summary 包含该任务的简短结果摘要

#### Scenario: 全部任务完成

- **WHEN** 计划中所有任务状态为 done
- **THEN** Agent Loop 进入 Quality Gate
- **AND** 通过后生成综合回复

### Requirement: 计划规模限制

Planner SHALL 限制计划规模，防止 UI 过度膨胀。

#### Scenario: 任务数量上限

- **WHEN** 请求可能需要超过 5 个步骤
- **THEN** Planner 只输出前 5 个最关键的步骤
- **AND** 其余步骤合并为一项 "其他"

#### Scenario: 计划标题

- **WHEN** Planner 生成计划
- **THEN** 计划标题从用户请求中提取（不超过 20 字）
