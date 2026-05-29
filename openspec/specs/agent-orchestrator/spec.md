## ADDED Requirements

### Requirement: 意图分类与路由

系统 SHALL 在用户发送消息时进行意图分类，将消息路由到匹配的子 Agent。

#### Scenario: 面试意图路由

- **WHEN** 用户消息匹配面试 coaching 意图（如"帮我准备面试"、"模拟面试练习"）
- **THEN** Orchestrator 将消息路由到 Interview Agent（`id: "interview"`）
- **AND** Interview Agent 的 System Prompt 和 Tool Set 被加载
- **AND** Agent Chat Header 显示"面试教练"标签

#### Scenario: JD 评估意图路由

- **WHEN** 用户消息匹配 JD 评估意图（如"评估这个JD"、"这个岗位怎么样"）
- **THEN** Orchestrator 将消息路由到 Eval Agent（`id: "evaluate"`）
- **AND** Eval Agent 的 System Prompt 和 Tool Set 被加载

#### Scenario: 通用意图路由

- **WHEN** 用户消息不匹配任何专用 Agent 的意图
- **THEN** Orchestrator 将消息路由到 General Agent（`id: "general"`）
- **AND** General Agent 保留所有现有工具

#### Scenario: 意图切换

- **WHEN** 用户在同一会话中发送不同类型的消息（如刚完成面试练习，现在"帮我评估刚才提到的JD"）
- **THEN** Orchestrator 自动检测意图变化
- **AND** 切换到匹配的子 Agent
- **AND** 对话历史保留，新 Agent 可以读取之前的上下文

### Requirement: 轻量意图分类器

系统 SHALL 使用客户端正则 + 关键词匹配实现意图分类，不依赖 LLM 进行路由判断。

#### Scenario: 优先级匹配

- **WHEN** 用户消息同时匹配多个 Agent 的意图模式
- **THEN** 选择 `priority` 最高的 Agent
- **AND** 同优先级时按注册顺序选择

#### Scenario: 显式指定 Agent

- **WHEN** 用户消息包含"用面试教练模式"或"切换到 JD 评估"等显式指定
- **THEN** Orchestrator 直接路由到指定 Agent
- **AND** 跳过意图匹配逻辑

#### Scenario: 分类失败兜底

- **WHEN** 分类器无法确定意图（异常情况）
- **THEN** 回退到 General Agent
- **AND** 不阻塞用户消息处理
