## ADDED Requirements

### Requirement: MemoryCoordinator SHALL orchestrate three memory layers

`MemoryCoordinator` SHALL 在 orchestrator 调用时协调三层记忆：决定是否需要摘要、加载语义词条、构建优化后的上下文。

#### Scenario: buildContext — 正常对话

- **WHEN** `coordinator.buildContext(sessionId, messages)` 被调用
- **THEN** 返回 `{ truncatedMessages, summaryInjection, semanticInjection }`
- **AND** `truncatedMessages` 为最近 10 轮
- **AND** `summaryInjection` 为空或最新摘要文本
- **AND** `semanticInjection` 为从 SQLite 加载的语义事实文本

#### Scenario: 需要触发摘要

- **WHEN** `messages` 中用户消息 > 15 轮且无最新摘要
- **THEN** coordinator 异步调用摘要生成
- **AND** 摘要写入 SQLite `session_memory`（`summary_type = 'episodic'`）

#### Scenario: 新会话语义注入

- **WHEN** sessionId 对应的会话是新的（< 3 轮）
- **THEN** coordinator 从 SQLite 加载所有历史 `summary_type = 'semantic'` 记录
- **AND** 合并为 "已知偏好：..." 文本注入 `semanticInjection`
