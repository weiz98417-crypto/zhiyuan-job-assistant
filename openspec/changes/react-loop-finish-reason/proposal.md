## Why

Agent 循环缺失三个成熟项目共有的核心机制:模型通过 `stop_reason` 控制何时停止(而非 Harness 代劳判断 `toolCalls.length===0`)、工具错误作为 Observation 返回模型自我修正(而非引擎 `return` 硬退出)、结构化 intermediate_steps 累积(失败时能总结"试了什么"。当前这三者缺失导致 agent 反复调用错误工具、错误处理生硬(引擎写死提示)、超限时只输出"达到思考上限"。

参考 Anthropic Messages API(stop_reason 模式)、LangChain AgentExecutor(intermediate_steps 累积)、OpenAI Assistants(run.status 状态机)。

## What Changes

- **finish_reason 驱动循环**:用 DeepSeek 返回的 `finish_reason` 替代 `toolCalls.length===0` 决定循环继续还是停止
- **错误作为 Observation**:`permanent`/`need_user_input` 不再 `return` 硬退出,而是作为 Observation 发给模型,让模型自己组织用户引导
- **intermediate_steps 累积**:每次工具执行追加结构化步骤记录,超限时生成总结
- **简化质量检查**:合并 `checkResultQuality` 和 `ERROR_CATEGORY_ACTIONS` 为一套基于 errorCategory 的调度

## Capabilities

### New Capabilities

- `finish-reason-driven-loop`: Agent Loop 由模型 `finish_reason` 驱动停止/继续,而非 Harness 猜测
- `error-as-observation`: 工具错误作为 Observation 返回模型,模型自主决定如何告知用户

### Modified Capabilities

- `agent-loop-engine`: 循环控制逻辑从 `toolCalls.length` 改为 `finish_reason` + 错误不再硬退出
- `agent-loop-client`: 同上

## Impact

- `src/lib/agent/loop/client-runner.ts` — finish_reason / 错误 Observation / intermediate_steps
- `src/lib/agent/loop/server-runner.ts` — 同上
- `src/app/api/agent/think/route.ts` — SSE 流末尾注入 finish_reason
- `src/lib/agent/prompt.ts` — 更新错误处理说明为 Anthropic 模式
- `src/lib/agent/registry/agents/resume-agent.ts` — 同步 prompt 更新
