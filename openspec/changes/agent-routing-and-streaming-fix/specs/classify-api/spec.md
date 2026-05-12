## ADDED Requirements

### Requirement: LLM 意图分类 API 端点

系统 SHALL 提供 `POST /api/agent/classify` 端点，接收消息历史，返回 LLM 分类结果。

接受 JSON body：`{ messages: [{ role: string, content: string }] }`。
返回 JSON：`{ success: true, data: { agentId: string, reason: string, modelTier: "default" | "pro" } }`。

#### Scenario: 明确评估意图
- **WHEN** 用户发"帮我评估这个JD"
- **AND** 消息历史中上一条用户消息包含 JD 全文
- **THEN** 返回 `{agentId: "evaluate", modelTier: "default"}`
- **AND** reason 说明分类依据

#### Scenario: 无历史上下文的评估意图
- **WHEN** 用户发"帮我评估一个JD"（无 JD 正文，无历史消息中有 JD）
- **THEN** 仍返回 `{agentId: "evaluate"}`
- **AND** evaluate agent 会追问用户提供 JD

#### Scenario: 分类失败降级
- **WHEN** 所有 LLM API 不可用
- **THEN** 返回 `{agentId: "general", reason: "fallback"}`
- **AND** 服务端日志记录分类失败原因

### Requirement: 消息历史上下文感知

分类器 SHALL 在 prompt 中包含最近消息摘要，使 LLM 能理解指代关系。

#### Scenario: 指代识别
- **WHEN** 消息历史为：[用户发JD全文, "帮我评估这个JD"]
- **THEN** 分类器 prompt 包含第一条消息的摘要（如"[消息1] 用户发送了一份AI产品经理的JD，包含职责要求和加分项..."）
- **AND** LLM 能理解"这个JD"指代第一条消息中的内容

#### Scenario: 长消息截断
- **WHEN** 消息内容超过 500 字
- **THEN** 分类器 prompt 中截断为前 200 字 + "..."
- **AND** 不影响分类准确性
