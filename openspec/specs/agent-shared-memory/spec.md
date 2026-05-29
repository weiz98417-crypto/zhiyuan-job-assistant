## ADDED Requirements

### Requirement: 共享记忆层

所有子 Agent SHALL 通过统一的 Shared Memory 层读写会话上下文和用户画像。

#### Scenario: 跨 Agent 写入

- **WHEN** 用户与 Interview Agent 完成面试练习
- **THEN** 练习记录和评分结果写入 Agent Memory
- **AND** 信号自动提取到 `profile_signals` 表
- **WHEN** 用户随后切换到 Eval Agent 评估 JD
- **THEN** Eval Agent 可以获取 Interview Agent 提取的信号和弱项

#### Scenario: Career DNA 作为共同上下文

- **WHEN** 任意子 Agent 初始化 System Prompt
- **THEN** Prompt 中包含当前 Career DNA 摘要（技能、偏好、底线、目标）
- **AND** Career DNA 的内容从 `profile_signals` 和 `config/profile.yml` 聚合生成
- **AND** 所有 Agent 读取同一份 Career DNA，保持一致性

#### Scenario: 会话 Memory Digest

- **WHEN** 当前会话消息 ≥5 条 user 消息
- **THEN** 生成 Memory Digest（摘要对话中的关键信息）
- **AND** Memory Digest 作为所有子 Agent 的上下文注入
- **AND** 切换子 Agent 时 Memory Digest 保持不变

### Requirement: 消息来源标记

Agent Memory 中的消息 SHALL 标记产生该消息的子 Agent ID。

#### Scenario: 消息 agent_id 字段

- **WHEN** 子 Agent 产生一条 assistant 消息或 tool 消息
- **THEN** 消息记录包含 `agent_id` 字段（如 `"interview"`、`"evaluate"`、`"general"`）
- **AND** 消息存储到 IndexedDB 的 Agent 会话中

#### Scenario: 对话渲染时区分 Agent

- **WHEN** 消息列表被渲染到 Agent Chat
- **THEN** 根据 `agent_id` 在消息旁显示对应 Agent 的名称标签（小号、半透明）
- **AND** 连续的同一 Agent 消息不重复显示标签
