## Context

`true-multi-agent-upgrade` 将 agent loop 搬到了服务端（`orchestrateGen` → `agentLoopServer`）。这带来了三个系统性问题：

1. **callLLM 不流式** — 内部 `while(true)` 缓冲整个 LLM 响应后才返回 `{text, toolCalls}`，前端得不到渐进输出
2. **工具调用不可见** — `evaluate_jd_full` 内部调 `/api/evaluate-pipeline`（SSE 流），但 tool handler 读完流才返回，用户看不到进度
3. **React 渲染阻塞** — `while(true)` 循环不释放事件循环，`agent_switch` 触发的 `setActiveAgent` 不会 re-render

已有基础设施：`agentLoopClient`（客户端 ReAct loop 已有实现）、`/api/agent/think`（LLM 代理端点已可用）、agent.md（已创建）、agent 注册表（已有 model/toolNames）、前端 SSE 接收器（已支持 intent/agent_switch）。

## Goals / Non-Goals

**Goals:**
- 恢复客户端 ReAct loop 架构，流式输出和工具调用可见性天然工作
- 服务端新增轻量 classify 和 soul 端点，客户端无需 import `fs`
- classify 端点接收完整消息历史，LLM 能理解"评估这个JD"中"这个"的指代
- 评估链路端到端：分类→切 agent→调风险检测→调 A-G 评估→流式输出报告

**Non-Goals:**
- 不改 tool handler 的进度流式（evaluate_jd_full 内部仍是一次返回，后续单独优化）
- 不改 agent.md 格式
- 不新增 API provider
- 不删除 `true-multi-agent-upgrade` 已有的 agent.md 和 model 分级

## Decisions

### D1: 客户端 loop vs 修服务端 streaming

**选客户端 loop**（恢复 `agentLoopClient`）。

备选：把 `callLLM` 改成 async generator，让 `agentLoopServer` 边收流边 yield。被否——改动深（callLLM → agentLoopServer → orchestrateGen 三层都要改），且 `while(true)` 不释放事件循环导致 React 不 re-render 的问题仍存在。

`agentLoopClient` 已有实现且验证过工作，`for await` 天然释放事件循环，React 正常 re-render。

### D2: classify API 的输入

**传完整消息历史**（不只最后一条用户消息）。

备选：只传最后一条用户消息。被否——分类器无法理解"评估这个JD"中"这个"指什么。

实现：`
POST /api/agent/classify  { messages: [{role, content}, ...] }

类型定义复用 agent.md 的分类 prompt 模板，追加用户消息历史中的关键信息。

### D3: soul API 的格式

**返回纯文本 system prompt**（已完成上下文变量替换）。

备选：返回原始 agent.md + 客户端自己做变量替换。被否——Career DNA、会话记忆等变量在服务端已有，客户端需要额外调多次 API 才能获取。

实现：`
GET /api/agent/soul?agent=evaluate

类型定义将 loadAgentMD + buildSystemPrompt 的逻辑合并到一个端点。返回 `{ body: string, model: string }`。

### D4: 上下文指代处理

**在 classify prompt 中注入上一条用户消息的摘要**。

用户说"帮我评估这个JD"时，分类器需要知道"这个"指什么。做法：classify prompt 中包含最近 3 条消息的摘要（每条 ≤100 字），不传完整长文本（省 token）。

### D5: 与 true-multi-agent-upgrade 的关系

**此 change 替换 true-multi-agent-upgrade 中的服务端 loop 部分**。

保留内容：
- agent.md 文件和 loadAgentMD
- model/modelPro 字段
- classifyIntentLLM 模块（被 classify API 复用）
- agent_switch UI 标签

废弃内容：
- orchestrateGen（服务端 generator）
- /api/agent/run（改用 classify + soul + agentLoopClient）

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     客户端 (agent/page.tsx)                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  用户发消息                                                    │
│      │                                                        │
│      ├─ 1. POST /api/agent/classify ← {messages: [...]}      │
│      │      └→ {agentId: "evaluate", modelTier: "default"}   │
│      │                                                        │
│      ├─ 2. GET /api/agent/soul?agent=evaluate                 │
│      │      └→ {body: "你是纸鸢的JD评估专家...", model: "deepseek-v4-flash"}
│      │                                                        │
│      ├─ 3. agentLoopClient(systemPrompt, messages, tools)     │
│      │      │                                                 │
│      │      ├─ POST /api/agent/think ← {systemPrompt, msgs}  │
│      │      │      └→ SSE 流式返回文本/tool_calls             │
│      │      │                                                 │
│      │      ├─ tool_calls? → executeTool → POST /api/agent/think
│      │      │      └→ SSE 流式返回                            │
│      │      │                                                 │
│      │      └→ 最终文本                                        │
│      │                                                        │
│      └─ 渲染消息 + agent 标签                                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘

服务端新增:
  /api/agent/classify   — LLM 意图分类（5-10s，传完整历史）
  /api/agent/soul        — agent.md 加载 + 上下文替换

服务端保留:
  /api/agent/think       — LLM 代理（已有）
  load-agent-md.ts       — agent.md 解析（已有）
  classify-intent-llm.ts  — 分类器核心逻辑（已有）
```

## Risks / Trade-offs

- **[延迟] classify + soul 两个请求增加 1 次往返** → 缓解：classify 返回后 soul 异步预加载；两个请求并行（agentId 已知但 soul 未知时可先准备）
- **[LLM 分类仍可能返回 general]** → 缓解：classify prompt 已在 `true-multi-agent-upgrade` 中加固；此 change 新增分类失败时的客户端 retry（调 classify 再试一次）
- **[agentLoopClient 的 tool 执行为同步]** → evaluate_jd_full 内部调 `/api/evaluate-pipeline`（30-60s），用户在此期间看到"🔧 调用工具..."。缓解：本次不改 tool 内部流式，后续单独优化
- **[flash 模型 reasoning 消耗 token]** → classify 调用已设 `max_tokens: 1024`，实测够用

## Open Questions

- classify API 是否需要缓存？同一用户短时间内重复分类可跳过（热缓存 60s）
- agent.md 更新后是否需要热加载？当前设计是每次请求都读文件（Next.js dev 热更新覆盖）
