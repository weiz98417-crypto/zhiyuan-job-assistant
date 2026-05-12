## ADDED Requirements

### Requirement: Agent preference model SHALL be stored server-side

Agent 偏好模型（角色/公司偏好 + 衰减权重）SHALL 通过 API 读写 SQLite，支持跨会话学习。

#### Scenario: 保存偏好

- **WHEN** 用户接受/拒绝 Agent 推荐
- **THEN** `POST /api/agent/prefs` 更新角色/公司权重（含衰减时间戳）

#### Scenario: 加载偏好

- **WHEN** Agent 构建 system prompt
- **THEN** `GET /api/agent/prefs` 返回当前有效偏好（已衰减）
- **AND** 注入 system prompt 供 LLM 参考
