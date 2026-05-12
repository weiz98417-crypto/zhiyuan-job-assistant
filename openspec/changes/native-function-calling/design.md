## Context

当前架构：`client-runner.ts` 在每个循环迭代中调 `/api/agent/think`（DeepSeek V4 Flash 代理），收集完整文本响应后在客户端用 `parseToolCall()` 正则解析 `<<TOOL>>` 标签。如果找到工具调用就 client-side fetch 执行，否则把文本当最终回复。

目标状态：`/api/agent/think` 接收 OpenAI 兼容的 `tools` 数组传给 DeepSeek，模型通过 API 原生决定调哪个工具。流式响应中解析 `delta.tool_calls[]` 片段，流结束后产出结构化 `tool_calls` SSE 事件。`client-runner.ts` 消费这些事件执行工具，不再需要正则解析。

约束：不引入新的 AI SDK 依赖（不装 `@anthropic-ai/sdk`、`ai`、`langchain`），DeepSeek V4 的 OpenAI 兼容 API 直接用 `fetch` 即可。

## Goals / Non-Goals

**Goals:**
- `/api/agent/think` 接受 `tools` 参数并原样传给 DeepSeek API
- 流式解析 `choices[0].delta.tool_calls[]` 并按 index 累积片段
- 流结束时产出 `{ type: "tool_calls", tool_calls: [...] }` SSE 事件
- `client-runner.ts` 用原生 `tool_calls` 事件替代 `parseToolCall()` 正则解析
- 现有全部工具（20 个）不经修改即可用于新协议

**Non-Goals:**
- 不迁移到 Vercel AI SDK 或任何第三方 Agent 框架
- 不改动工具自身的 handler 实现
- 不处理并行工具调用（DeepSeek V4 支持但本期不使用）
- 不改动服务端化循环（那是 `server-side-agent-loop` change 的范围）

## Decisions

### D1: 工具序列化格式 → OpenAI-compatible JSON Schema

ToolRegistry 现有 `buildToolListText()` 输出文本格式工具列表，注入系统提示。新增 `toOpenAITools()` 输出结构化格式：

```typescript
[{
  type: "function",
  function: {
    name: "evaluate_jd_full",
    description: "对 JD 进行完整评估...",
    parameters: {
      type: "object",
      properties: { jd_text: { type: "string", description: "..." } },
      required: ["jd_text"]
    }
  }
}]
```

**Why:** DeepSeek V4 的 `/chat/completions` 端点的 `tools` 字段与 OpenAI 格式完全兼容。参数描述直接复用现有 `ToolParameter.description`，无需新格式。

### D2: 流式 tool_calls 解析策略 → 按 index 累积，流结束产出

DeepSeek 流式响应的 `delta.tool_calls[]` 分多次到达：第一次有 `id` + `function.name`，后续有 `function.arguments` 片段。用 `Map<number, {id, name, arguments}>` 累积：

```typescript
const toolCallFragments = new Map<number, {id:string, name:string, arguments:string}>();
// 每个 chunk:
for (const tc of delta.tool_calls) {
  const idx = tc.index ?? 0;
  if (!toolCallFragments.has(idx)) toolCallFragments.set(idx, {id:"",name:"",arguments:""});
  const f = toolCallFragments.get(idx)!;
  if (tc.id) f.id = tc.id;
  if (tc.function?.name) f.name += tc.function.name;
  if (tc.function?.arguments) f.arguments += tc.function.arguments;
}
// 流结束后:
if (toolCallFragments.size > 0) {
  controller.enqueue(sse({ type: "tool_calls", tool_calls: [...toolCallFragments.values()] }));
}
```

**Why:** 不改变现有 SSE 流的文本输出逻辑（文本照常逐 chunk 流到前端），tool_calls 在流末尾一次性产出。这保持了与 `client-runner.ts` 现有 collect-then-parse 模式的最小差异。

### D3: RESEARCH_PROTOCOL → 删除格式部分，保留策略

当前 `RESEARCH_PROTOCOL` 包含两部分：格式指令（`<<TOOL>>工具名\n{json}<</TOOL>>`）和研究策略（实体拆分、先发现再深入、验证结果质量）。native function calling 后格式指令不再需要，但研究策略对模型仍有指导价值。

改动：删除第 122-128 行的格式部分和标签语法，保留：
```
【研究流程】
1. 拆实体：用户提到了几个独立实体？
2. 先发现再深入
3. 每个实体单独搜一次
4. 验证结果质量
5. 全部搜完后整合输出
```

**Why:** 研究策略提升搜索类工具调用的质量，与协议无关。删除格式指令消除了模板可能让模型产生混淆的风险。

### D4: `tool` role 消息处理 → 原生 `tool` role + `tool_call_id`

当前 `think/route.ts:39-42` 将 `role: "tool"` 消息转换为 `role: "user"`（因为 V4 之前要求 `tool_call_id`）。native function calling 后不再需要转换——使用原生 `tool` role 并在消息中传 `tool_call_id`。

**Why:** 原生格式让 DeepSeek 正确关联工具调用和结果，提升多轮工具调用的上下文理解。

## Risks / Trade-offs

- **[Risk] 现有工具 handler 在浏览器端执行（`fetch()`），native function calling 后工具仍在 client-runner.ts 中执行** → 不影响功能，但工具执行仍在浏览器端。服务端化在 `server-side-agent-loop` change 中处理。
- **[Risk] DeepSeek V4 对 `tools` 参数返回的 tool_call name 可能不精确匹配注册名** → `client-runner.ts` 在 `executeTool()` 前用 `registry.get(name)` 做精确 match，如果 name 不匹配则 fallback 到 fuzzy match（小写、去连字符等）。
- **[Trade-off] 工具定义序列化目前不做过滤** → 传全部工具给 LLM 可能导致 token 消耗增加（每个工具定义约 100-300 tokens）。但当前 20 个工具总量可控（~4000 tokens）。后续工具数增长时可在 `orchestrator` 层按 agent whitelist 过滤。

## Open Questions

- 是否需要在 think 代理层面做工具调用重试？（当前 `client-runner.ts` 的 autoRetry 逻辑保持不变，此问题延后到 `server-side-agent-loop` 处理）
