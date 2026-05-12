## ADDED Requirements

### Requirement: 客户端 ReAct Loop 恢复

用户发送消息后，客户端 SHALL 按以下顺序执行：
1. 调 `/api/agent/classify` 获取 agentId
2. 调 `/api/agent/soul` 获取 systemPrompt
3. 使用 `agentLoopClient` 运行 ReAct 循环（调 `/api/agent/think` 做 LLM 调用）

#### Scenario: 评估JD的完整链路
- **WHEN** 用户说"帮我评估这个JD"（上文已发 JD）
- **THEN** classify 返回 `{agentId: "evaluate"}`
- **AND** soul 返回 evaluate 的 system prompt（含工具策略）
- **AND** agentLoopClient 启动循环，first LLM call 收到 evaluate system prompt + evaluate tools
- **AND** LLM 调用 `evaluate_jd_full` 工具
- **AND** 工具结果包含风险检测和 A-G 评估
- **AND** LLM 基于工具结果生成流式文本回复

#### Scenario: 闲聊不触发工具
- **WHEN** 用户说"今天天气怎么样"
- **THEN** classify 返回 `{agentId: "general"}`
- **AND** agentLoopClient 使用 general system prompt
- **AND** LLM 直接文本回复，不调用工具

### Requirement: 流式文本输出

agentLoopClient SHALL 通过 `for await` 循环逐事件推送 LLM 的流式输出，React 在每次迭代中正常 re-render。

#### Scenario: 流式文本实时显示
- **WHEN** LLM 生成"这份JD整体来看匹配度较高。A板块：职位是AI产品经理..."
- **THEN** 前端逐字显示文本（不是等全部生成完一起显示）
- **AND** agent_switch 事件触发后，UI 标签即时更新

### Requirement: 工具调用可见

agentLoopClient SHALL 在前端展示工具调用进度：
- `tool_call` 事件显示"🔧 正在调用 {toolName}..."
- `tool_result` 事件显示工具执行结果

#### Scenario: 评估工具调用展示
- **WHEN** LLM 调用 `evaluate_jd_full`
- **THEN** 前端显示"🔧 正在调用 evaluate_jd_full..."
- **AND** 工具执行期间不阻塞文本流式输出（for await 释放事件循环）
- **AND** 工具完成后显示结果摘要
