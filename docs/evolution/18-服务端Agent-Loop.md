# 18 — 服务端 Agent ReAct Loop

> 所属阶段：Phase 3 · 2026-05-10 实施 · 核心改造 ~400 行

---

## 1. 问题

Phase 2 的 Agent 系统存在一个架构性缺陷：**大模型 API Key 裸露在前端**，且所有思考请求经过 `/api/agent/think` 代理，工具调用由浏览器端发起。这带来三个问题：

| 问题 | 影响 |
|------|------|
| API Key 泄露风险 | `DEEPSEEK_API_KEY` 在浏览器网络面板可截获 |
| 网络跳数翻倍 | 浏览器 → Next.js → DeepSeek → Next.js → 浏览器；工具调用同理 |
| 纯文本工具调用 | 前端发 fetch 执行工具，没有服务端上下文（文件系统、环境变量） |

**目标**：把整个 Agent ReAct Loop 搬到服务端，前端只消费 SSE 事件流。

```
Before (client-runner):                  After (server-runner):

浏览器                                    浏览器
  │  POST /api/agent/think                │  POST /api/agent/run
  │  POST /api/agent/tool/...             │
  │                                       │  接收 SSE stream
  ▼                                       ▼
Next.js API Route                        Next.js API Route
  │  转发到 DeepSeek                      │  ┌─ orchestrator (意图路由)
  │                                       │  ├─ agentLoopServer (ReAct loop)
  ▼                                       │  │   ├─ callLLM (直接调 DeepSeek)
DeepSeek API                              │  │   ├─ executeTool (服务端执行)
                                          │  │   └─ yield SSE events
                                          │  └─ return ReadableStream
                                          ▼
                                        DeepSeek API + Tool Registry
```

---

## 2. 双 Runner 架构

系统同时保留 `client-runner.ts` 和 `server-runner.ts`，各自服务不同场景：

```
┌──────────────────────────────────────────────────────────────┐
│                    orchestrator (index.ts)                    │
│                  classifyIntent → 路由到子 Agent               │
└──────────────────────┬───────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
┌──────────────────┐    ┌──────────────────────┐
│  server-runner   │    │   client-runner       │
│  (生产环境)       │    │   (开发/降级/兼容)     │
├──────────────────┤    ├──────────────────────┤
│ /api/agent/run   │    │ /api/agent/think     │
│ 直接调 LLM API   │    │ 经 think proxy 转发   │
│ 服务端执行工具    │    │ 浏览器端执行工具      │
│ SSE → Readable   │    │ AsyncGenerator → UI  │
│ Stream           │    │                      │
└──────────────────┘    └──────────────────────┘
```

### 使用场景对比

| 维度 | server-runner | client-runner |
|------|---------------|---------------|
| **入口** | `POST /api/agent/run` | 组件内直接调用 |
| **LLM 调用** | 服务端直连 DeepSeek/GLM/Qwen | 经 `/api/agent/think` 代理 |
| **API Key** | 服务端环境变量，不外泄 | 无 Key（由 think route 持有） |
| **工具执行** | `registry.execute()` 服务端 | `executeTool()` 浏览器端 |
| **研究协议注入** | 无（由 system prompt 处理） | `RESEARCH_PROTOCOL` 注入用户消息 |
| **搜索进度追踪** | 无 | `buildSearchProgress` |
| **输出流** | SSE → `ReadableStream` | `AsyncGenerator<SSEEvent>` |
| **最大时长** | 180s（`maxDuration`） | 无限制（浏览器端） |
| **终止信号** | `request.signal` abort | `AbortSignal` 参数 |
| **使用时机** | 生产环境，默认路径 | 调试、降级、兼容旧版 |

### 代码入口对照

**server-runner（route.ts）：**
```typescript
// src/app/api/agent/run/route.ts
const runner = agentLoopServer(systemPrompt, messages, undefined, tools, toolWhitelist);
for await (const event of runner) {
  controller.enqueue(encoder.encode(sse(event)));
}
```

**client-runner（组件中）：**
```typescript
// AgentChat.tsx 或其他组件
const runner = agentLoopClient(systemPrompt, messages, config, signal, skipProtocol, whitelist, tools);
for await (const event of runner) {
  dispatch({ type: event.type, payload: event });
}
```

---

## 3. 服务端 Loop 详细流程

### 3.1 MODEL_CHAIN 降级链

服务端直连三家国产大模型，按优先级依次尝试：

```
const MODEL_CHAIN = [
  { model: "deepseek-v4-flash",  url: "https://api.deepseek.com/chat/completions",    keyEnv: "DEEPSEEK_API_KEY" },
  { model: "glm-4.6v-flashx",    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", keyEnv: "ZHIPU_API_KEY" },
  { model: "qwen-long",          url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", keyEnv: "DASHSCOPE_API_KEY" },
];
```

**降级逻辑：**

```
callLLM(messages, systemPrompt, tools)
  │
  ├─ [1] deepseek-v4-flash
  │     ├─ API Key 存在？ → 否 → 跳过
  │     ├─ fetch POST (含 tools 定义、stream: true)
  │     ├─ 429/503？ → 重试 1 次（间隔 1s）
  │     ├─ 其他 4xx/5xx？ → 不重试，跳过
  │     └─ 200？ → 解析 stream → 返回 {text, toolCalls}
  │
  ├─ [2] glm-4.6v-flashx   ← DeepSeek 失败后尝试
  │     └─ 同上逻辑
  │
  ├─ [3] qwen-long          ← GLM 失败后尝试
  │     └─ 同上逻辑
  │
  └─ 全部失败 → throw Error("All models failed (last: {lastError})")
```

**关键细节：**
- 每层内部对 429（限流）和 503（服务不可用）重试 1 次，间隔 1 秒
- 非临时性错误（400/401/403/500）不重试，直接跳到下一层
- 如果某层 API Key 环境变量未配置，静默跳过
- 最终失败时抛出包含最后错误信息的异常，Loop 层捕获后发送 `text` 事件告知用户

### 3.2 流式响应解析

API 均返回 `stream: true` 的 SSE 流。解析过程：

```
SSE Stream Buffer 解析

  bytes arrive...
      │
      ▼
  TextDecoder.decode(value, {stream: true})
      │
      ▼
  buffer += chunk
      │
      ▼
  buffer.split("\n")
      │  ┌─ "data: {...JSON...}"  → JSON.parse → 提取 delta
      │  ├─ "data: [DONE]"        → 忽略
      │  └─ "" 或其他             → 忽略
      ▼
  delta 字段处理:
      │
      ├─ delta.content        → fullText += delta.content
      │
      └─ delta.tool_calls[]   → 按 index 累积到 toolCallFragments Map
            ├─ tc.id           → frag.id = tc.id
            ├─ tc.function.name     → frag.name += tc.function.name
            └─ tc.function.arguments → frag.arguments += tc.function.arguments

  返回 { text: fullText, toolCalls: Array.from(toolCallFragments.values()) }
```

**Native Function Calling 数据结构：**

```typescript
// LLM 返回的 tool_calls delta 结构（以 DeepSeek 为例）
{
  choices: [{
    delta: {
      content: "我需要先搜索一下...",    // 思考文本（可与 tool_calls 同时出现）
      tool_calls: [{
        index: 0,
        id: "call_abc123",
        type: "function",
        function: {
          name: "web_search",          // 可能分片到达，故用 += 拼接
          arguments: "{\"query\":"     // 同样分片拼接
        }
      }]
    }
  }]
}
```

**与 client-runner 的区别：**

| 解析细节 | server-runner | client-runner |
|----------|---------------|---------------|
| SSE 格式 | DeepSeek 原生格式 `data: {...}` | Think proxy 包装格式 `data: {type, content}` |
| tool_calls 提取 | 从 `delta.tool_calls` 按 index 拼接 | 从 `parsed.type === "tool_calls"` 直接获取 |
| 思考文本 | 与 tool_calls 同批返回，存入 ctx | 有 tool_calls 时截取前 200 字符流式输出 |

### 3.3 完整 Loop 伪代码

```
agentLoopServer(systemPrompt, messages, config, tools, toolWhitelist):

  state = { iteration:0, consecutiveFailures:0, contextSize, phase:"understanding" }
  ctx = messages
  autoRetryCount = 0
  recentCalls = []

  while state.iteration < config.maxIterations (默认 5):

    state.iteration++

    ┌─ 上下文截断 ──────────────────────────────┐
    │ if contextSize > MAX_CONTEXT_TOKENS (24000)  │
    │   ctx = ctx.slice(-15)                        │
    │   contextSize = estimateTokens(ctx)            │
    └─────────────────────────────────────────────┘

    phase = iteration===1 ? "understanding" : "reflecting"
    yield { type:"phase", phase }

    ┌─ LLM 调用 ────────────────────────────────┐
    │ resp = callLLM(ctx, systemPrompt, tools)    │
    │   → MODEL_CHAIN 降级                        │
    │   → 流式解析                                 │
    │   → { text, toolCalls }                     │
    │ catch: yield 错误 + done → return           │
    └─────────────────────────────────────────────┘

    if toolCalls.length === 0:
      yield { type:"phase", phase:"responding" }
      yield { type:"text", content: text || "操作完成。" }
      ctx.push({ role:"assistant", content:text })
      break   ← 正常结束

    for each toolCall:
      ┌─ 参数解析 ───────────────────────────────┐
      │ params = JSON.parse(tc.arguments)          │
      └─────────────────────────────────────────────┘

      ┌─ 去重检查 ───────────────────────────────┐
      │ if recentCalls 中有同名同参:                │
      │   复用缓存结果，跳过执行                     │
      │   console.log("[loop] dedup: skip repeat") │
      └─────────────────────────────────────────────┘

      yield { type:"phase", phase:"executing" }
      yield { type:"tool_call", name, params }

      ┌─ 工具白名单检查 ─────────────────────────┐
      │ if toolWhitelist && !toolWhitelist.has(name)│
      │   yield tool_result (success:false)         │
      │   consecutiveFailures++                     │
      │   continue                                  │
      └─────────────────────────────────────────────┘

      ┌─ 工具执行 + 自愈 ────────────────────────┐
      │ try:                                        │
      │   toolResult = await executeTool(name, params)  │
      │ catch:                                       │
      │   toolResult = { success:false, ... }        │
      │ formatted = formatToolResult(toolResult, name)│
      └─────────────────────────────────────────────┘

      yield { type:"tool_result", name, result:formatted, success }
      ┌─ 自愈事件 ────────────────────────────────┐
      │ if !toolResult.success:                     │
      │   yield { type:"tool_error", name, error,    │
      │           recoverable: toolResult.recoverable !== false } │
      └─────────────────────────────────────────────┘

      yield { type:"phase", phase:"verifying" }

      quality = checkResultQuality(formatted)
      yield { type:"result_quality", quality }

      ┌─ 质量门控 + retryHint 注入 ──────────────┐
      │ if !success:                                │
      │   if recoverable===false:                   │
      │     hint = "无法重试，告知用户原因"           │
      │   else:                                     │
      │     hint = retryHint || "换参数重试"          │
      │     autoRetryCount++                         │
      │ elif quality==="empty":                     │
      │   hint = "搜索结果为空，换关键词重搜"          │
      │   autoRetryCount++                           │
      │ elif quality==="irrelevant":                │
      │   hint = "结果不相关，换精确关键词重搜"        │
      │   autoRetryCount++                           │
      │ else:                                       │
      │   autoRetryCount = 0                         │
      └─────────────────────────────────────────────┘

      ctx.push({ role:"user",
        content: `<!-- tool:${name} result -->\n${formatted}${hint}\n\n【请深度分析】` })

      if success: consecutiveFailures = 0
      else: consecutiveFailures++

    ┌─ 硬停止：连续失败 >= 2 ────────────────────┐
    │ yield 错误文本 + done → return                │
    └─────────────────────────────────────────────┘

    ┌─ 自动重试上限 > MAX_AUTO_RETRY (2) ───────┐
    │ yield "搜索暂不可用，基于已有知识分析"         │
    │ forceResp = callLLM(ctx, systemPrompt, tools) │
    │ yield forceResp.text                          │
    │ yield done → return                           │
    └─────────────────────────────────────────────┘

  if 达到最大迭代次数:
    yield "达到思考上限，请重新提问。" + done

  yield { type:"done" }
```

---

## 4. 质量门控 Loop

### 4.1 结果质量检测

```
checkResultQuality(formatted)
  │
  ├─ trimmed 为空？
  │   └─ → "empty"
  │
  ├─ trimmed === "未找到相关结果" || "搜索失败: 未找到相关结果"？
  │   └─ → "empty"
  │
  ├─ 命中垃圾模式正则？
  │     /被惡魔附身/ | /理想之城/ | /電視劇/
  │     /动漫/ | /游戏/ | /小说/ | /連載/
  │   └─ → "irrelevant"
  │       （这些是中文公司名被搜索到同名文化作品的情况）
  │
  └─ → "good"
```

**三个质量等级的行为差异：**

| 质量 | 含义 | autoRetryCount | LLM 收到指令 |
|------|------|----------------|-------------|
| `good` | 结果有效可用 | 重置为 0 | 正常分析 |
| `empty` | 搜索无结果 | +1 | "换不同关键词重新搜索，不要直接回复用户" |
| `irrelevant` | 同名文化作品等 | +1 | "换更精确的关键词重新搜索，不要直接回复用户" |

### 4.2 两级停止机制

```
┌─────────────────────────────────────────────────────────┐
│                    防御层 1: 连续失败                     │
│  consecutiveFailures >= 2                                │
│  → "工具连续失败 N 次，请检查配置或稍后重试。"             │
│  → done                                                  │
│  触发条件：工具返回 success:false                         │
│  场景：API Key 未配置、服务端权限问题                      │
├─────────────────────────────────────────────────────────┤
│                    防御层 2: 自动重试上限                  │
│  autoRetryCount > MAX_AUTO_RETRY (2)                     │
│  → "搜索暂不可用（已尝试 N 次），以下是我基于已有知识的分析："│
│  → 最后一轮 LLM 调用（无 quality hint）                   │
│  → done                                                  │
│  触发条件：结果为空/不相关（工具执行成功了但结果质量差）     │
│  场景：小众公司搜不到、关键词始终不匹配                     │
└─────────────────────────────────────────────────────────┘
```

**两者的区别：**

- `consecutiveFailures`：工具**执行失败**（网络错误、权限错误），是硬错误。连续 2 次立刻停止。
- `autoRetryCount`：工具执行**成功但结果无效**（空结果、不相关），是软错误。最多自动重试 2 次，之后降级为"基于已有知识回答"而非直接报错。

### 4.3 配置常量

| 常量 | 值 | 位置 | 说明 |
|------|-----|------|------|
| `DEFAULT_LOOP_CONFIG.maxIterations` | 5 | `types.ts` | 最大 ReAct 迭代轮数 |
| `MAX_CONTEXT_TOKENS` | 24000 | 两个 runner | 上下文 token 上限（字符估算） |
| `MAX_AUTO_RETRY` | 2 | 两个 runner | 空/不相关结果最大自动重试次数 |
| `maxDuration` | 180s | `route.ts` | API Route 最大执行时间 |

---

## 5. 工具执行与自愈

### 5.1 执行链与错误分类

```
executeTool(name, params)
  │
  ├─ ToolRegistry.execute()
  │     │
  │     ├─ activeAgentTools 白名单检查
  │     │   └─ 不在白名单？
  │     │       → { success: false, error: "工具在当前 Agent 模式下不可用" }
  │     │         （这是可恢复错误——LLM 可以换工具）
  │     │
  │     ├─ tool.handler(params)
  │     │   └─ 抛出异常？
  │     │       → { success: false, error: err.message }
  │     │         recoverable 未设置 → 默认 true
  │     │
  │     └─ 正常返回 ToolResult
  │
  └─ 返回 ToolResult → loop 层处理
```

### 5.2 ToolResult 自愈字段

```typescript
interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  recoverable?: boolean;   // 默认 true。false = 永久失败，不要重试
  retryHint?: string;      // 仅在 recoverable=true 时有效
}
```

**不同失败模式的 retryHint 注入逻辑（server-runner 和 client-runner 完全一致）：**

```
if (!toolResult.success)
  ├─ recoverable === false
  │   → hint = "工具执行失败（无法重试）: {error}。请直接告知用户原因并引导用户操作。"
  │   → autoRetryCount 不增加（这是永久失败，不该重试）
  │
  └─ recoverable === true | undefined
      → hint = "工具执行失败: {error}。{retryHint || '请换参数重试、使用其他工具获取信息、或基于已有知识直接回答。'}"
      → autoRetryCount++
```

**典型场景示例：**

| 场景 | success | recoverable | retryHint | Loop 行为 |
|------|---------|-------------|-----------|-----------|
| 网络超时 | false | true | "请换一组关键词重试" | autoRetryCount++，LLM 重试 |
| API Key 未配置 | false | false | — | 直接告知用户，不重试 |
| 文件不存在 | false | false | — | 直接告知用户 |
| 搜索无结果 | true | — | — | quality="empty" → autoRetryCount++ |
| 搜索到错误内容 | true | — | — | quality="irrelevant" → autoRetryCount++ |
| 正常成功 | true | — | — | autoRetryCount=0，继续 |

### 5.3 自愈事件对前端的影响

当 `tool_error` 事件发出后，前端 `AgentChat` 组件会在工具状态指示器中显示错误信息：

```typescript
// types.ts
{ type: "tool_error"; name: string; error: string; recoverable: boolean }
```

前端解析此事件后：
- 显示工具名称 + 红色错误标记
- `recoverable: true` → 提示"Agent 正在尝试修复..."
- `recoverable: false` → 提示"此操作失败，请手动处理"

---

## 6. 上下文管理

### 6.1 三层截断策略

```
┌──────────────────────────────────────────────────────────┐
│                     原始消息列表                           │
│  [sys] [user:msg1] [asst:resp1] [user:msg2] ... [msgN]  │
└──────────────────────┬───────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  ┌──────────────┐          ┌──────────────────┐
  │  orchestrator │          │   agent Loop      │
  │  层截断        │          │   层截断           │
  ├──────────────┤          ├──────────────────┤
  │ coordinator   │          │ MAX_CONTEXT_      │
  │ .buildContext │          │ TOKENS = 24000   │
  │               │          │                  │
  │ working: 10轮 │          │ ctx.slice(-15)   │
  │ episodic: 摘要│          │ 保留最近 15 条    │
  │ semantic: 跨  │          │ 消息             │
  │ 会话事实      │          │                  │
  └──────────────┘          └──────────────────┘
```

### 6.2 Token 估算

```typescript
function estimateTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}
```

**使用字符数作为 token 估算**（中文 1 字符约等于 1-2 token，实际安全余量充足）：

- 触发截断阈值：`state.contextSize > 24000`
- 截断方式：保留最近 15 条消息
- 截断后重新估算：`state.contextSize = estimateTokens(ctx)`
- 下一轮迭代时如果仍然超限，再次截断（循环安全）

### 6.3 工具调用去重

```typescript
const recentCalls: { name: string; params: string; result: string }[] = [];
// 容量: 5，FIFO

// 每次工具调用前检查:
const paramsKey = JSON.stringify(params);   // 参数序列化为字符串做 key
const recent = recentCalls.find(
  (c) => c.name === tc.name && c.params === paramsKey
);
if (recent) {
  // 直接复用缓存结果，不实际执行工具
  toolResult = { success: true, data: recent.result };
  formatted = recent.result;
}
```

**设计意图：** LLM 在后续迭代中可能重复调用同一工具（尤其是搜索工具），去重避免重复 API 请求和资源浪费。缓存容量 5 条覆盖最近一轮迭代的全部工具调用。

### 6.4 上下文组装全链路

```
用户消息到达 POST /api/agent/run
  │
  ├─ 1. orchestrator.orchestrate(userMessage, ctx)
  │     ├─ classifyIntent → 确定子 Agent（通用/评估/简历/面试/画像）
  │     ├─ getCareerDNASummary → 求职 DNA 摘要
  │     ├─ getCVSummary → localStorage 简历内容
  │     ├─ getKnowledgeForAgent → Agent 专属知识库
  │     ├─ getClaudeAgentActivity → Claude Agent 最近活动
  │     ├─ buildContext(sessionId, messages)
  │     │     ├─ buildWorkingContext(messages, 10) → 最近 10 轮对话
  │     │     ├─ loadSummary(sessionId) → 长对话摘要
  │     │     └─ loadSemanticContext() → 跨会话事实
  │     │
  │     └─ agent.buildSystemPrompt(promptCtx) → 最终 system prompt
  │
  ├─ 2. agentLoopServer(systemPrompt, messages, config, tools, toolWhitelist)
  │     └─ 使用完整 systemPrompt + messages 启动 Loop
  │        （Loop 内部有自己的截断逻辑，见 6.1）
  │
  └─ 3. 返回 ReadableStream<SSE>
```

---

## 7. SSE 事件类型与前端流转

### 7.1 完整事件类型表

```typescript
type SSEEvent =
  | { type: "phase";            phase: AgentPhase }                          // 阶段切换
  | { type: "thinking_content"; content: string }                             // 思考过程（预留）
  | { type: "tool_call";        name: string; params: Record<string, unknown> } // 工具调用开始
  | { type: "tool_result";      name: string; result: string; success: boolean } // 工具结果
  | { type: "tool_error";       name: string; error: string; recoverable: boolean } // 工具错误（自愈）
  | { type: "result_quality";   quality: "good" | "empty" | "irrelevant" }   // 结果质量判定
  | { type: "text";             content: string }                             // 响应文本（流式片段）
  | { type: "tool_calls";       tool_calls: Array<{id,name,arguments}> }     // 批量工具调用（client-runner）
  | { type: "done" };                                                         // 会话结束
```

### 7.2 一次完整对话的事件流时序

```
POST /api/agent/run
  │
  ▼
── SSE: phase: "understanding"        ← Loop 开始，第 1 轮
── SSE: phase: "executing"            ← LLM 返回了 tool_calls
── SSE: tool_call: {name:"web_search", params:{query:"字节跳动 2026"}}
── SSE: tool_result: {name:"web_search", result:"...", success:true}
── SSE: phase: "verifying"            ← 检查结果质量
── SSE: result_quality: "good"        ← 质量通过
── SSE: phase: "reflecting"           ← 第 2 轮，LLM 分析结果
── SSE: phase: "executing"            ← 再次调用工具
── SSE: tool_call: {name:"evaluate_jd_full", params:{...}}
── SSE: tool_result: {name:"evaluate_jd_full", result:"{score:4.2,...}", success:true}
── SSE: phase: "verifying"
── SSE: result_quality: "good"
── SSE: phase: "reflecting"           ← 第 3 轮
── SSE: phase: "responding"           ← LLM 决定不需要更多工具，开始回复
── SSE: text: "根据我的分析，"        ← 响应文本流式输出
── SSE: text: "字节跳动 AI 产品经理"
── SSE: text: "岗位匹配度 4.2/5..."
── SSE: done                          ← 会话结束
```

### 7.3 错误场景的事件流

**场景 A：搜索无结果 + 自动重试：**

```
── SSE: phase: "understanding"
── SSE: phase: "executing"
── SSE: tool_call: {name:"web_search", params:{query:"小众公司"}}
── SSE: tool_result: {success:true, result:"未找到相关结果"}
── SSE: phase: "verifying"
── SSE: result_quality: "empty"        ← 空结果
── SSE: phase: "reflecting"            ← LLM 被提示"换关键词重搜"
── SSE: phase: "executing"
── SSE: tool_call: {name:"web_search", params:{query:"小众公司 北京"}}
── SSE: tool_result: {success:true, result:"未找到相关结果"}
── SSE: phase: "verifying"
── SSE: result_quality: "empty"        ← 仍然空，autoRetryCount 达上限
── SSE: phase: "responding"
── SSE: text: "搜索暂不可用（已尝试 2 次），以下是我基于已有知识的分析：..."
── SSE: done
```

**场景 B：工具执行失败（可恢复）：**

```
── SSE: phase: "understanding"
── SSE: phase: "executing"
── SSE: tool_call: {name:"web_search", params:{query:"..."}}
── SSE: tool_result: {success:false, result:"请求超时"}
── SSE: tool_error: {name:"web_search", error:"请求超时", recoverable:true}  ← 自愈事件
── SSE: phase: "verifying"
── SSE: result_quality: "good"         ← 质量检查 still runs
  （consecutiveFailures: 1）
── SSE: phase: "reflecting"            ← LLM 收到 retryHint → 换参数重试
  ...
```

**场景 C：工具连续失败 2 次 → 硬停止：**

```
── SSE: phase: "executing"
── SSE: tool_call: {name:"scan_portals", params:{...}}
── SSE: tool_result: {success:false, result:"API Key 未配置"}
── SSE: tool_error: {recoverable:false}  ← 不可恢复
  （consecutiveFailures: 1）
── SSE: phase: "executing"
── SSE: tool_call: {name:"fetch_jd_content", params:{...}}
── SSE: tool_result: {success:false, result:"网络错误"}
── SSE: tool_error: {recoverable:true}
  （consecutiveFailures: 2）            ← 触发硬停止
── SSE: phase: "responding"
── SSE: text: "工具连续失败 2 次，请检查配置或稍后重试。"
── SSE: done
```

### 7.4 前端消费方式

**route.ts 侧：**
```typescript
const stream = new ReadableStream({
  async start(controller) {
    const runner = agentLoopServer(systemPrompt, messages, undefined, tools, toolWhitelist);
    for await (const event of runner) {
      if (aborted) break;
      controller.enqueue(encoder.encode(sse(event)));
      // sse() = `data: ${JSON.stringify(event)}\n\n`
    }
  },
});

return new Response(stream, {
  headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
});
```

**前端 AgentChat 组件通过 `EventSource` 或 `fetch` + `ReadableStream` 消费 SSE 流，按 `event.type` 分发到对应的状态更新逻辑。**

---

## 8. Phase 生命周期

### 8.1 五阶段状态机

```
                     ┌─────────────┐
                     │ understanding│ ← iteration 1
                     │   (识别中)    │
                     └──────┬──────┘
                            │ LLM 返回 tool_calls
                            ▼
                     ┌─────────────┐
              ┌─────│  executing   │──────┐ 每个 toolCall
              │      │  (执行中)    │      │ 一次循环
              │      └──────┬──────┘      │
              │             │              │
              │             ▼              │
              │      ┌─────────────┐      │
              │      │  verifying   │      │
              │      │  (验证中)    │      │
              │      └──────┬──────┘      │
              │             │              │
              └─────────────┘              │
                            │ 下一轮迭代
                            ▼
                     ┌─────────────┐
                     │  reflecting  │ ← iteration 2+
                     │  (分析结果中) │
                     └──────┬──────┘
                            │ 无 toolCalls 或达到终止条件
                            ▼
                     ┌─────────────┐
                     │  responding  │
                     │  (回复中)    │
                     └──────┬──────┘
                            │
                            ▼
                     ┌─────────────┐
                     │    done      │
                     │   (结束)     │
                     └─────────────┘
```

### 8.2 各阶段详解

| Phase | 触发条件 | 含义 | 前端显示 |
|-------|---------|------|---------|
| `understanding` | `iteration === 1` | 首次理解用户意图，LLM 正在分析 | "Agent 正在理解..." |
| `executing` | LLM 返回 tool_calls 时，每个工具调用前 | 正在执行工具 | 工具名 + 旋转动画 |
| `verifying` | 每个工具执行完成后 | 检查结果有效性和质量 | 结果绿色/黄色/红色标记 |
| `reflecting` | `iteration >= 2` | LLM 分析上一轮工具结果，决定下一步 | "Agent 正在分析结果..." |
| `responding` | 无更多工具调用，或达到终止条件 | 生成最终回复文本 | 文本流式输出 |

### 8.3 状态转换规则

```
understanding ──→ executing        (当 toolCalls.length > 0)
understanding ──→ responding       (当 toolCalls.length === 0)
executing     ──→ verifying        (每个 toolCall 执行后)
verifying     ──→ executing        (同轮还有更多 toolCall)
verifying     ──→ reflecting       (所有 toolCall 执行完，下一轮迭代)
reflecting    ──→ executing        (LLM 决定需要更多工具)
reflecting    ──→ responding       (LLM 认为不需要更多工具)
任何 phase    ──→ responding       (consecutiveFailures >= 2 或 autoRetryCount > 2)
responding    ──→ done             (文本输出完毕)
任何 phase    ──→ done             (达到 maxIterations)
```

---

## 9. 与 client-runner 的差异总结

| 功能点 | server-runner | client-runner |
|--------|---------------|---------------|
| **研究协议注入** | 无（由 system prompt 负责） | `RESEARCH_PROTOCOL` 注入最后一条 user msg |
| **搜索进度追踪** | 无 | `buildSearchProgress` 列出已执行搜索 |
| **思考文本流式输出** | 不输出（存入 ctx） | 截取前 200 字符逐 4 字符流式输出 |
| **响应文本输出方式** | 整块 yield | 逐 8 字符流式 + 5ms 延迟模拟打字 |
| **模型降级** | `MODEL_CHAIN` 三级降级 | 仅 DeepSeek（通过 think proxy） |
| **LLM 重试** | 429/503 重试 1 次 | 无重试（由 think proxy 处理） |
| **消息截断** | `ctx.slice(-15)` | `truncateContext(ctx, 15)` |
| **Abort 支持** | `request.signal` + `aborted` flag | `AbortSignal` 参数 + 每次 yield 前检查 |
| **工具调用前导文本** | 无前置输出 | 先输出思考文本片段再执行工具 |
| **maxDuration** | 180s（Next.js 限制） | 无限制 |

---

## 10. 涉及文件

| 文件 | 职责 |
|------|------|
| `src/app/api/agent/run/route.ts` | SSE 端点入口：orchestrate → agentLoopServer → ReadableStream |
| `src/lib/agent/loop/server-runner.ts` | 服务端 ReAct Loop 核心实现 |
| `src/lib/agent/loop/client-runner.ts` | 客户端 ReAct Loop（保留兼容） |
| `src/lib/agent/loop/types.ts` | 共享类型：LoopConfig、LoopState、SSEEvent、AgentPhase |
| `src/lib/agent/orchestrator/index.ts` | 意图路由：classifyIntent → buildSystemPrompt → toolWhitelist |
| `src/lib/agent/tools/index.ts` | 工具注册与执行：ToolRegistry、executeTool、formatToolResult |
| `src/lib/agent/tools/registry.ts` | ToolRegistry 类：register/get/execute/toOpenAITools |
| `src/lib/agent/tools/types.ts` | ToolResult、ToolDefinition、ToolParameter |
| `src/lib/agent/memory/coordinator.ts` | 记忆协调器：三层上下文组装 |
