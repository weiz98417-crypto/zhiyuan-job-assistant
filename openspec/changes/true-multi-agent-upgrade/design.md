## Context

当前 Agent 架构用正则做意图分类（`classifyIntent()` 遍历 `intentPatterns`），sub-agent 切换只是换 system prompt，所有"agent"共享同一个 ReAct loop。已有基础设施：`agentLoopServer`（server-side）、`MODEL_CHAIN` fallback（DeepSeek→Zhipu→Qwen）、`ToolRegistry`、SSE 流式协议、前端 `AgentChat` 组件。

## Goals / Non-Goals

**Goals:**
- LLM 驱动的意图分类替换正则，DeepSeek V4 Flash，延迟 <1s
- 每个 agent 独立 agent.md（角色/风格/策略）+ .ts（注册字段），从 `buildEvalPrompt()` 拆出 soul
- Sub-agent 跑独立的 ReAct loop，orchestrator 通过 `yield*` 委托
- Agent 级别模型声明（Flash/Pro），按任务类型分级

**Non-Goals:**
- 不新增 API provider（仅用已有的 DeepSeek + Zhipu）
- 不改前端 SSE 协议或 AgentChat 组件
- 不改 ToolRegistry 注册机制
- 不加 agent 间复杂协商协议（本次只需委托+返回）

## Decisions

### D1: Orchestrator 本身是 agent vs 函数调用

选 **Orchestrator 为独立 agent**（有自己的 agent.md + system prompt + LLM 分类调用）。

- 备选：orchestrator 仍为函数，只把分类换成 LLM JSON call。被否——orchestrator 未来需要处理"你这个意图超出我的范围，让我帮你转接"等对话逻辑，函数做不到。
- orchestrator 不注册工具，职责只有意图分类 → 委托。输出结构化 JSON：`{agentId, reason}`。

### D2: LLM 分类 vs embedding 相似度

选 **LLM JSON 分类**（给 LLM agent 列表 + 用户消息，要求输出 JSON）。

- 备选：embedding 相似度匹配。被否——需要维护 agent 描述的 embedding、无法处理混合意图、对新 agent 扩展需重建索引。
- LLM 分类只需在 agent 注册时更新 agent 描述文本，零额外维护。

### D3: agent.md 格式

选 **Markdown + YAML frontmatter**，与 CLAUDE.md / AGENTS.md 生态一致。

```markdown
---
name: "JD 评估"
model: "deepseek-v4-flash"
model_pro: "deepseek-v4-pro"
---

你是纸鸢的 JD 评估专家...
```

加载：`loadAgentMD(agentId)` 解析 frontmatter + body，body 直接作为 system prompt 基础，frontmatter 的 model/model_pro 注入 AgentDefinition。

### D4: 模型分级策略

| Agent | 默认 model | 升级 model | 触发条件 |
|-------|-----------|-----------|---------|
| orchestrator | deepseek-v4-flash | — | — |
| evaluate | deepseek-v4-flash | deepseek-v4-pro | 用户说"深度评估" |
| resume | deepseek-v4-pro | — | 默认即 Pro |
| interview | deepseek-v4-pro | — | 默认即 Pro |
| profile | deepseek-v4-flash | — | — |
| general | deepseek-v4-flash | — | — |

升级检测：orchestrator 分类时额外返回 `modelTier: "default" | "pro"`，根据用户措辞判断（"深度评估""精修""仔细分析"→pro）。

### D5: Agent Loop 改造方式

选 **参数化 `agentLoopServer`**，不重写。

`callLLM()` 新增 `model?` 参数——如果 `agent.model` 匹配 MODEL_CHAIN 的 entry，跳过前几个不匹配的；否则用默认 chain。

```typescript
async function* agentLoopServer(opts: {
  agent: AgentDefinition;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  tools?: Array<{ type: string; function: object }>;
}): AsyncGenerator<SSEEvent>
```

### D6: 委托流协议

```typescript
async function* orchestrate(content, ctx): AsyncGenerator<SSEEvent> {
  yield { type: "phase", phase: "understanding" };
  const intent = await classifyIntentLLM(content);
  yield { type: "intent", agentId: intent.agentId, reason: intent.reason };

  const agent = getAgentById(intent.agentId);
  yield { type: "agent_switch", agentId: agent.id, agentName: agent.name };

  yield* agentLoopServer({ agent, systemPrompt: agent.systemPrompt, messages: ctx.messages, tools: agent.tools });
}
```

事件类型 `intent` 和 `agent_switch` 是新增的，前端 AgentChat 的 `AgentMessage` 类型需增加对应字段（非破坏性）。

## Risks / Trade-offs

- **[延迟] Orchestrator 多一次 LLM 调用 → +500ms-1s 首响应** → 缓解：Flash 模型 TTFT 0.6-1.2s；前端显示"正在理解意图..."；LLM 不可用时 fallback 正则
- **[成本] 每次对话多一次分类调用** → 缓解：Flash 1元/百万token，单次分类约 0.0003 元，日千次不到 1 元
- **[分类错误] LLM 可能分错 agent** → 缓解：正则保留为 fallback；orchestrator 在委托消息中告知用户"我来帮你评估"——如果用户纠正，general agent 可重新路由
- **[Pro 成本] 简历和面试默认 Pro** → 缓解：这些是低频高价值任务；Pro 约 5 倍于 Flash 但仍可控（单次评估约 0.01-0.05 元）
- **[agent.md 不被 versioned]** → 用户手工编辑 agent.md 时可能出错 → 缓解：frontmatter 有 schema 校验；agent.md 缺失时 .ts 里有 fallback prompt

## Open Questions

- agent.md 是否支持 `@import` 引用共享知识块（如"中国市场规则"各 agent 都需要）？→ 待实现时决定，可以先在 `loadAgentMD` 中做 base prompt 拼接
- orchestrator 是否需要工具（如 `web_search`）来辅助分类？→ 第一期不需要，纯文本分类足够
- 多个 agent 间的接力场景（评估完自动建议"要不要生成针对性简历？"）→ 本次不做，预留 orchestrator 的 `suggestNext` 字段
