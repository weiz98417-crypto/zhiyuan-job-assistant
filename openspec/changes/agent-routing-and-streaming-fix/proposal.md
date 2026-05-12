## Why

`true-multi-agent-upgrade` 将 agent 循环从客户端搬到服务端（`orchestrateGen`），但服务端 `callLLM` 缓冲全量响应后再返回，破坏了流式输出。同时 LLM 分类器虽然能正确识别意图，但分类成功后 agent 切换和工具调用链路存在系统性断裂——用户发 JD 后说"评估这个"，分类器不理解"这个"指什么，且即使分类正确，evaluate agent 的工具（黑话风险检测、A-G 评估）从未被触发。需要回退到客户端 ReAct loop 架构，服务端只做分类和 agent 灵魂加载。

## What Changes

- **新增 `/api/agent/classify`** — 服务端 LLM 意图分类端点。接收 messages（含历史上下文），返回 `{agentId, reason, modelTier}`。传入完整消息历史，LLM 能理解"这个JD"指代上文发的 JD
- **新增 `/api/agent/soul`** — 返回 agent.md 的 system prompt body（含上下文变量替换）。客户端不再需要 import `fs` 读 agent 文件
- **恢复客户端 agent loop** — `agent/page.tsx` 重新使用 `agentLoopClient` 跑 ReAct 循环。流式输出、工具调用可见性天然工作
- **废弃服务端 loop** — `/api/agent/run` 和 `orchestrateGen` 不再使用。客户端调 classify 拿到 agent → 调 soul 拿到 prompt → agentLoopClient 跑循环
- **保留** — `/api/agent/think`（LLM 代理端点，流式返回）、agent.md 文件、agent 注册表、MODEL_CHAIN fallback、ToolRegistry、agent_switch UI 标签

## Capabilities

### New Capabilities

- `classify-api`: 服务端 LLM 意图分类 API，接收消息历史，返回结构化 agent 路由决策。理解上下文中的指代关系（"评估这个"→指上文发的 JD）
- `soul-api`: 服务端 agent.md 加载 API，返回替换上下文变量后的 system prompt，客户端无需 `fs`
- `client-side-loop`: 客户端 ReAct loop 恢复——分类 → 加载灵魂 → agentLoopClient（流式 LLM 调用 + 工具执行），工具调用和文本输出均流式可见

### Modified Capabilities

- `llm-intent-classification`: 分类 API 接收完整消息历史（不只最后一条），利用上文理解指代。prompt 增加任务级优先级规则，确保"评估JD"类意图不会被分到 general
- `multi-agent-independent-loops`: loop 回到客户端执行，服务端只做分类和 soul 加载。每个 agent 循环仍是独立的（不同 systemPrompt + tools）

## Impact

- **新增**: `src/app/api/agent/classify/route.ts`、`src/app/api/agent/soul/route.ts`
- **恢复**: `src/app/agent/page.tsx` 中 `agentLoopClient` + `orchestrate` 调用链
- **废弃/简化**: `src/lib/agent/orchestrator/index.ts` 的 `orchestrateGen`、`src/app/api/agent/run/route.ts`
- **保留不动**: agent.md 文件、agent 注册表、agentLoopClient、/api/agent/think、MODEL_CHAIN、ToolRegistry
- **无关**: 前端 SSE 协议、AgentChat 组件、agent_switch UI 标签
