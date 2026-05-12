## ADDED Requirements

### Requirement: Agent 灵魂加载 API

系统 SHALL 提供 `GET /api/agent/soul?agent=<agentId>` 端点，返回指定 agent 的 system prompt。

返回 JSON：`{ success: true, data: { body: string, model: string } }`。

#### Scenario: 加载 evaluate agent 灵魂
- **WHEN** 请求 `GET /api/agent/soul?agent=evaluate`
- **THEN** 返回 evaluate agent.md 的 body 内容
- **AND** body 中已替换上下文变量（Career DNA、知识注入）
- **AND** model 返回 `deepseek-v4-flash`

#### Scenario: agent 不存在
- **WHEN** 请求 `GET /api/agent/soul?agent=nonexistent`
- **THEN** 返回 `{ success: false, error: "Agent not found" }` (404)

#### Scenario: agent.md 文件缺失
- **WHEN** agent 存在但 agent.md 文件缺失
- **THEN** 返回 fallback body："你是纸鸢的 {agentName} 助手。根据用户需求提供帮助。"
- **AND** 服务端日志记录 warning

### Requirement: 服务端上下文注入

soul API SHALL 在返回 system prompt 前注入以下上下文：
- Career DNA（用户求职画像）
- 会话记忆摘要（如可用）
- Agent 特定知识（如 salary-benchmarks、jd-signals）

#### Scenario: 上下文变量替换
- **WHEN** 用户画像数据存在
- **THEN** system prompt 末尾包含 `## 用户画像 (Career DNA)\n{画像内容}`
- **AND** 不覆盖 agent.md 中已定义的角色和行为准则
