## Why

当前 Agent ReAct 循环完全在浏览器端执行（`client-runner.ts:216`）。关掉浏览器标签页 → Agent 死亡。工具执行通过客户端 `fetch()` 代理，每个工具调用多一次网络往返。且 `<<TOOL>>` 文本协议升级为 native function calling 后，客户端仍持有循环逻辑，而 DeepSeek API key 始终在服务端——循环在服务端可以直接调 API，消除不必要的客户端复杂度。

## What Changes

- **BREAKING**: 删除 `frontend/src/lib/agent/loop/client-runner.ts`（440 行），ReAct 循环移至服务端
- 新建 `frontend/src/lib/agent/loop/server-runner.ts`：服务端 ReAct 循环，async generator 签名不变，工具执行走 `registry.execute()` 而非 `fetch()` 代理
- 新建 `frontend/src/app/api/agent/run/route.ts`：SSE 端点，接收 `{ sessionId, messages }`，调 orchestrator → 跑 server-runner → 流式返回 SSE 事件
- 修改 `frontend/src/app/agent/page.tsx`：删除 `agentLoopClient` 调用，替换为 `fetch("/api/agent/run")` SSE 消费，删除 `<<TOOL>>` 解析相关 UI 逻辑
- orchestrator 的 `OrchestratorResult` 中 `tools` 字段已由 change 1 添加，此处消费

## Capabilities

### New Capabilities

- `server-side-agent-loop`: 服务端 ReAct 循环——在 Next.js API route 中执行 Think→Act→Observe 循环，直接调 DeepSeek API + ToolRegistry.execute()，通过 SSE 流式返回事件到浏览器

### Modified Capabilities

- `agent-loop-client`: 客户端 Agent Loop 需求移除——循环逻辑从浏览器迁至服务端。浏览器端只做 SSE 事件渲染
- `agent-loop-engine`: 循环引擎位置从前端 lib 迁至服务端 API route，但 async generator 接口保持不变

## Impact

- **新建**: `frontend/src/lib/agent/loop/server-runner.ts`
- **新建**: `frontend/src/app/api/agent/run/route.ts`
- **修改**: `frontend/src/app/agent/page.tsx`（大幅简化）
- **修改**: `frontend/src/lib/agent/loop/types.ts`（SSEEvent 类型服务端化适配）
- **删除**: `frontend/src/lib/agent/loop/client-runner.ts`
- **依赖**: `native-function-calling`（change 1），服务端循环直接消费 native tool_calls
