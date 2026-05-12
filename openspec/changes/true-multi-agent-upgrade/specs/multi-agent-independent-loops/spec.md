## ADDED Requirements

### Requirement: Sub-agent 独立 ReAct loop

每个 sub-agent SHALL 运行自己的 ReAct loop，拥有独立的 system prompt、tool whitelist、model selection，不与 orchestrator 或其他 agent 共享 LLM context。

Orchestrator 分类完意图后通过 `yield*` 委托给目标 agent 的 loop。

#### Scenario: 评估 agent 独立循环
- **WHEN** orchestrator 分类意图为 evaluate 并委托
- **THEN** evaluate agent 启动自己的 ReAct loop，使用 evaluate 专用的 system prompt 和工具列表
- **AND** evaluate agent 的 LLM 调用使用其声明的 model（deepseek-v4-flash）

#### Scenario: 工具隔离
- **WHEN** evaluate agent 运行中尝试调用 `generate_cv`（简历 agent 的工具）
- **THEN** 调用被拒绝，toolWhitelist 校验失败
- **AND** agent 收到工具不可用的提示

#### Scenario: Agent 间上下文隔离
- **WHEN** 用户先让 evaluate agent 评估了一个 JD，然后切换对话让 resume agent 优化简历
- **THEN** 两个 agent 各自的 LLM context 互不污染，resume agent 的 context 中不包含 evaluate agent 的完整推理历史
- **AND** 会话的持久化消息（数据库中）记录 agent_id 区分每条消息的来源

### Requirement: Orchestrator 委托协议

Orchestrator SHALL 通过 SSE 事件通知前端当前激活的 agent：

```
phase: understanding → intent: {agentId, reason, modelTier} → agent_switch: {agentId, agentName}
```

然后 `yield*` 委托给目标 agent loop 的所有后续事件。

#### Scenario: 前端收到 agent 切换通知
- **WHEN** orchestrator 委托给 evaluate agent
- **THEN** 前端收到 `agent_switch` 事件
- **AND** UI 显示"JD 评估"标签，指示当前活跃的 agent

#### Scenario: 用户消息触发多次 agent 切换
- **WHEN** 用户在不同消息中分别要求评估和面试
- **THEN** 每次消息的 SSE 流都包含对应 agent 的 `agent_switch` 事件

### Requirement: 每个 agent 的 system prompt 来自 agent.md

Sub-agent 的 system prompt SHALL 从对应该 agent 的 agent.md 文件加载，而不是从 index.ts 中的 `buildEvalPrompt()` 等函数生成。

#### Scenario: system prompt 加载
- **WHEN** orchestrator 加载 evaluate agent
- **THEN** evaluate agent 的 systemPrompt 内容来自 `registry/agents/evaluate/agent.md` 的 body 部分
- **AND** 上下文变量（Career DNA、会话记忆、agent 知识）在注入前被替换到 prompt 模板中
