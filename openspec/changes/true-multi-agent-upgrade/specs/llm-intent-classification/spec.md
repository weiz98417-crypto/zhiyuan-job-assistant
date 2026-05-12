## ADDED Requirements

### Requirement: LLM 驱动的意图分类

系统 SHALL 使用 LLM（DeepSeek V4 Flash）对用户消息进行意图分类，替代原有的正则匹配方式。

分类器接收用户消息和当前 agent 列表作为输入，输出结构化 JSON：
```json
{"agentId": "evaluate", "reason": "用户要求评估一个JD", "modelTier": "default"}
```

#### Scenario: 明确的 JD 评估意图
- **WHEN** 用户说"帮我评估这个JD"
- **THEN** 分类器返回 `{agentId: "evaluate", modelTier: "default"}`

#### Scenario: 简历修改意图
- **WHEN** 用户说"帮我把简历里的项目经验改一下"
- **THEN** 分类器返回 `{agentId: "resume", modelTier: "default"}`

#### Scenario: 深度评估触发了 Pro
- **WHEN** 用户说"帮我深度评估一下这个岗位"
- **THEN** 分类器返回 `{agentId: "evaluate", modelTier: "pro"}`

#### Scenario: 闲聊意图
- **WHEN** 用户说"今天天气怎么样"或"你能做什么"
- **THEN** 分类器返回 `{agentId: "general", modelTier: "default"}`

### Requirement: 分类延迟上限

意图分类的端到端延迟 SHALL 不超过 3 秒。超时后自动降级到正则 fallback。

#### Scenario: 分类在 3 秒内完成
- **WHEN** LLM API 正常响应
- **THEN** 分类在 1 秒内完成，用户感知不到延迟

#### Scenario: 分类超时降级
- **WHEN** LLM API 在 3 秒内无响应
- **THEN** 系统自动降级到正则 intentPatterns 匹配，并输出 warning 日志

### Requirement: 正则保留为 fallback

原有的 `intentPatterns` 正则在以下情况 SHALL 作为 fallback：
- LLM API 全部不可用（所有 MODEL_CHAIN 模型失败）
- 分类超时
- LLM 返回的 agentId 不在注册表中

#### Scenario: API 全部不可用
- **WHEN** DeepSeek 和 Zhipu API 均返回 5xx
- **THEN** 系统使用正则匹配分类，不中断用户对话流
