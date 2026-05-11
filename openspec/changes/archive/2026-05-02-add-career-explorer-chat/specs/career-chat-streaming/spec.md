## ADDED Requirements

### Requirement: AI 流式聊天
聊天页面 SHALL 通过 `/api/chat/stream` 与 AI 进行实时对话，AI 回复以打字机效果逐字展示。

#### Scenario: 发送消息并接收流式回复
- **WHEN** 用户在输入框输入内容并点击发送
- **THEN** 用户消息立即显示在对话区
- **AND** AI 回复以逐字符流式追加到最新一条消息中
- **AND** 流式传输期间输入框禁用，显示"AI 回复中..."状态

#### Scenario: 流式传输中断
- **WHEN** SSE 流在中途断开或超时
- **THEN** 已接收的部分内容保留在对话区
- **AND** 显示"重新发送"按钮，点击后重试当前轮次

#### Scenario: 新对话
- **WHEN** 用户点击"重新开始"
- **THEN** 对话历史清空
- **AND** AI 自动发送开场问候消息

### Requirement: AI 引导式提问
系统 SHALL 引导 AI 按照访谈框架逐步探索用户的经验、技能、偏好和约束，而非一次性提问。

#### Scenario: 逐步探索
- **WHEN** 用户回答 AI 关于经验的问题
- **THEN** AI 基于回答追问具体细节或转向下一个探索维度
- **AND** 每轮 AI 问题数不超过 2 个

#### Scenario: 用户表达不确定性
- **WHEN** 用户回复"不知道"、"不确定"或表达困惑
- **THEN** AI 提供具体选项或示例帮助用户锚定（如"比如是喜欢管人还是喜欢做事？"）

### Requirement: 对话持久化
聊天历史 SHALL 在页面刷新后从 localStorage 恢复。

#### Scenario: 刷新恢复
- **WHEN** 用户在聊天中途刷新页面
- **THEN** 之前的所有消息从 localStorage 恢复并展示

#### Scenario: 手动清除
- **WHEN** 用户点击"清除历史"
- **THEN** localStorage 中的聊天记录被清除
- **AND** 页面恢复到初始空对话状态

### Requirement: 流式 API 端点
`/api/chat/stream` SHALL 代理 DeepSeek API 的 SSE 流式响应，将 AI 生成的 token 逐块传递给前端。

#### Scenario: 成功流式转发
- **WHEN** API 收到有效的 messages 数组和 DEEPSEEK_API_KEY
- **THEN** 向 DeepSeek 发起 `stream: true` 请求
- **AND** 将 DeepSeek 返回的 SSE chunk 逐块 pipe 到客户端

#### Scenario: API Key 缺失
- **WHEN** 环境变量 DEEPSEEK_API_KEY 未配置
- **THEN** 返回 500 错误 `{ success: false, error: "未配置 DEEPSEEK_API_KEY" }`

#### Scenario: 消息列表过长
- **WHEN** 请求的 messages 数组超过 30 条
- **THEN** 仅保留最近 30 条发送给 DeepSeek，超出部分截断
