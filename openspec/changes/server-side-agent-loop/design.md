## Context

当前架构：`page.tsx` 在浏览器端调用 `client-runner.ts` 的 `agentLoopClient()` async generator，该 generator 在每次迭代中 `fetch("/api/agent/think")` 调 DeepSeek。工具 handler 在浏览器端执行（`fetch()` 或 IndexedDB 操作）。

目标：循环移至 `/api/agent/run` 内部。浏览器端只做 SSE 事件渲染，不再持有循环逻辑。

## Goals / Non-Goals

**Goals:**
- ReAct 循环在服务端执行，浏览器标签关闭不影响循环
- 工具 handler 在服务端直接调用（消除 `fetch()` 代理的网络往返）
- 现有 SSE 事件类型（`phase`, `tool_call`, `tool_result`, `text`, `done`）保持兼容
- page.tsx 简化为纯 SSE 消费 + UI 渲染

**Non-Goals:**
- 不改动 SSE 事件格式
- 不改动 orchestrator、ToolRegistry、5 个子 agent 定义
- 不处理服务端会话持久化（在 `layered-memory` change 中）

## Decisions

### D1: 循环迁移策略 → 重写 server-runner.ts，不复用 client-runner.ts

`server-runner.ts` 从 `client-runner.ts` 移植核心逻辑（质量门控、上下文截断、自动重试），但做 3 个关键改动：
1. DeepSeek API 直接调用（`fetch(api.deepseek.com)`），不经 `/api/agent/think` 代理
2. 工具执行走 `registry.execute()`（同步或 await），不经 `fetch()` 代理
3. 不依赖浏览器 API（`AbortSignal` → 服务端超时机制）

**Why:** client-runner.ts 440 行与浏览器耦合（`AbortSignal`, `fetch()` 代理, `RESEARCH_PROTOCOL` 注入到浏览器消息）。移植核心逻辑（~200 行）比重写统一接口更快且更安全——保持相同的质量门控行为。

### D2: SSE 端点 → 单一 `/api/agent/run`

`/api/agent/run` 接收完整消息历史 + sessionId，执行 orchestrator → server-runner → SSE 流。不拆分 orchestrator 和 runner 为独立端点。

**Why:** orchestrator 的输出（systemPrompt, tools, toolWhitelist）直接传给 runner，无需中间存储或序列化。拆分会增加一次往返。

### D3: 工具执行上下文 → 服务端 ToolRegistry

`server-runner.ts` 中工具执行不再需要 `fetch()` 代理。可以直接 `registry.execute()`（ToolRegistry 的 execute 方法本身是 async，无论 handler 内部实现如何）。

当前工具 handler 分两类：
- 浏览器端直接操作（IndexedDB）：`search_applications`, `get_profile` 等 6 个——需改为调 API
- fetch API 端点的：其他 14 个——改为直接调服务端函数

**Transition plan:** 先建 `/api/agent/data/*` 薄代理层处理浏览器端工具 → 后续 change 逐步迁移 handler 到服务端。

## Risks / Trade-offs

- **[Risk] 服务端 DeepSeek API 调用无 `/api/agent/think` 的错误重试逻辑** → 从 think/route.ts 移植重试逻辑（429/503 重试 2 次）
- **[Risk] IndexedDB 工具 handler 不可在服务端执行** → 过渡期内浏览器端工具通过 `fetch("/api/agent/data/...")` 桥接，`server-side-agent-loop` 完成后逐步迁移
