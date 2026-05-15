## Context

当前 Agent Loop 用 `toolCalls.length === 0` 决定停止,用 `degradeToUser` 时 `return` 硬退出。Anthropic/LangChain/OpenAI 三个项目共用相反的模式:模型控制何时停,错误是数据不是退出信号。

## Goals / Non-Goals

**Goals:**
- 模型通过 `finish_reason` 控制循环停止
- 工具错误作为 Observation 返回模型(不硬 return)
- 超限时输出 structured summary 而非空白提示
- 向后兼容:不影响正常流程

**Non-Goals:**
- 不改 maxIterations 默认值
- 不改 UI
- 不改其他 agent 的 agent.md(已在前面改过)

## Decisions

### 1. finish_reason 驱动(参考 Anthropic stop_reason)

DeepSeek API 流末尾的 `choices[0].finish_reason`:
- `"tool_calls"` → 模型还要继续调工具 → continue loop
- `"stop"` → 模型给出最终回答 → break, respond
- `"length"` → token 截断 → handle gracefully

需要在 `/api/agent/think` 的 SSE 流末尾注入 `finish_reason` 事件,在 client-runner 的 `collectThinkResponseStreaming` 中收集。

### 2. 错误 Observation(参考 Anthropic is_error + LangChain intermediate_steps)

```typescript
// 不这样:
if (action.degradeToUser) { yield { type: "text", content: hardcodedMsg }; return; }

// 而是这样:
if (action.degradeToUser) {
    ctx.push({ role: "user", content: `[TOOL_ERROR category=${category}] ${error}\n请告知用户并给出建议。` });
    continue; // 让模型在下一轮生成自然语言的引导
}
```

### 3. intermediate_steps 累积(参考 LangChain AgentExecutor)

```typescript
const intermediateSteps: Array<{tool: string; params: string; category: ErrorCategory; summary: string}> = [];
// 每次工具执行后 push
// 超限时:
const summary = intermediateSteps.map(s => `- ${s.tool}: ${s.summary}`).join("\n");
yield { type: "text", content: `已尝试 ${intermediateSteps.length} 次:\n${summary}\n请重新描述你的需求。` };
```

## Risks

- finish_reason 依赖 DeepSeek API 返回,回退时 GLM/Qwen 也支持
- 错误不再 hard return 可能导致额外一轮 LLM 调用 → accept(更好的 UX)
