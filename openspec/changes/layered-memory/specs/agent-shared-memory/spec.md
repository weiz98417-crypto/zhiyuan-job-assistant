## MODIFIED Requirements

### Requirement: Session context SHALL use layered memory instead of truncation

Shared memory 层 SHALL 通过 `MemoryCoordinator.buildContext()` 构建上下文，替代原有的简单消息截断（`getSessionContext()` → `slice(-15)`）和 `memoryDigest` 机制。

#### Scenario: 上下文构建

- **WHEN** orchestrator 构建 Agent 上下文
- **THEN** 调用 `MemoryCoordinator.buildContext(sessionId, messages)`
- **AND** 返回的 `truncatedMessages` 替代直接截断的原始消息
- **AND** `summaryInjection` + `semanticInjection` 追加到 system prompt

#### Scenario: Career DNA 保持不变

- **WHEN** 系统加载 Career DNA
- **THEN** 现有 `getCareerDNASummary()` 路径不变
- **AND** Career DNA 与语义记忆互补（DNA 是用户预设，语义记忆是对话中学到的）
