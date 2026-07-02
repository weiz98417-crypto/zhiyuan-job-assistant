# 18 — 服务端 Agent ReAct Loop

所属阶段：Phase 3 · 持续演进

服务端 Agent Loop 最初解决的是“API key 不应暴露在前端”和“工具执行应该放在服务端”的问题。当前它已经演进为“任务契约 + 工具治理 + 读回校验 + 运行复盘”的闭环：Loop 不只负责调模型和工具，还要判断一次高风险任务是否真的完成。

当前真实行为：

- `DEFAULT_LOOP_CONFIG.maxIterations = 5`，不是无限循环。
- 高风险任务会生成 `AgentTaskContract`，包含任务类型、目标、成功条件、校验器和路由治理信息。
- 工具调用前会经过 `enforceToolGovernance()`，任务类型、Agent 白名单、读回要求不匹配时会被拦截。
- 写入类工具必须通过 `read-back verification`，例如报告保存后读 `/api/data/reports/{reportNum}`，简历修改后比对 hash，优秀简历保存后读回角色方向和内容摘要。
- 图片上传会在 loop 前先走 `image-intake`；如果图片识别失败或文本/图片冲突，不应让聊天模型绕过识别直接回答。
- 当前 LAN 的 Postgres 环境会创建 `agent_runs` 和 `agent_run_steps`，终态 run 会触发 `agent_run_reviews` 和 `agent_eval_candidates`。
- 自动自愈目前是“有限修复”：可重试、可降级、可阻止错误成功态、可沉淀 eval 候选；不会自动改代码、自动加测试或自动部署。

当前可视化入口：

- Agent Chat：活动 run 状态条、图片识别工具卡、上下文压缩状态、工具卡片。
- `/admin/agent-runs`：运行台账与 step 调试。
- `/admin/agent-reviews`：复盘治理与 Eval 候选队列。

更完整的当前边界见 [22-当前系统状态与治理闭环](./22-当前系统状态与治理闭环.md)。

---

## 1. 问题

Phase 2 的 Agent 系统存在一个架构性缺陷：**大模型 API Key 裸露在前端**，且所有思考请求经过 `/api/agent/think` 代理，工具调用由浏览器端发起。这带来三个问题：

| 问题 | 影响 |
|------|------|
| API Key 泄露风险 | `DEEPSEEK_API_KEY` 在浏览器网络面板可截获 |
| 网络跳数翻倍 | 浏览器 → Next.js → DeepSeek → Next.js → 浏览器；工具调用同理 |
| 纯文本工具调用 | 前端发 fetch 执行工具，没有服务端上下文（文件系统、环境变量） |

**目标**：把整个 Agent ReAct Loop 放在服务端执行，前端只消费 SSE 事件流。评估类工具完成后由服务端接口写入 repository 数据层；当前 LAN 写入 PostgreSQL，SQLite 仅作为 fallback/archive。

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

## 设计思想

服务端 Agent Loop 的质量门控设计直接受到了 **Claude Code 自身执行模型的启发**。Claude Code 在执行任务时显示的那一行状态文字——"Forging... (33s · ↓ 915 tokens · thinking)"——不仅仅是一个进度条。它在传达一件关键的事情：**AI 的思考过程对用户是可见的**。用户看到的不是一个转圈圈的加载动画，而是 Agent 正在经历的每一个认知阶段。这种可见性消除了"AI 是不是卡住了"的焦虑，也让用户能够判断 Agent 的推理路径是否正确——如果"理解阶段"只花了 0.5 秒就开始执行工具，用户就知道 Agent 可能没有充分理解任务。

筝筝纸鸢的 Phase 状态机正是这一理念的实现。五个阶段（understanding → executing → verifying → reflecting → responding）不是代码实现的内部状态标记，而是**用户可见的认知过程**。前端根据 `phase` 事件渲染不同的 UI 状态：understanding 阶段显示"Agent 正在理解..."，executing 阶段显示具体的工具名称和执行动画，verifying 阶段显示结果质量标记（绿色/黄色/红色）。这种设计解决了 Agent 系统最普遍的用户体验问题——"黑盒感"。用户不再面对一个无声的等待，而是旁观 Agent 完成一次有节奏的、可追踪的推理过程。

自动重试与降级机制（MAX_AUTO_RETRY → force respond）的设计灵感来自**人类专家面对不确定性的应对策略**。一个资深研究员在搜索不到可靠信息时，不会反复搜索然后崩溃——她会调整搜索关键词尝试两三次，如果仍然无果，就会基于已有知识给出一份诚实的、带有限定条件的回答："根据目前可查的信息无法确认，但基于行业经验，我的判断是……"。Agent Loop 的两级停止机制（硬错误连续失败 ≥ 2 次立即停止，软错误空结果最多自动重试 2 次后降级回答）精确地复制了这个人类策略。这不是工程上的妥协，而是一种经过深思熟虑的鲁棒性设计——承认不确定性也比无休止地重试要好。

把 Agent Loop 从客户端搬到服务端的决策是基于一个简单但重要的安全原则：**API Key 永远不应该暴露在前端**。在 client-runner 架构中，Agent 推理虽然通过 `/api/agent/think` 代理，但工具调用由浏览器发起——这意味着浏览器的网络面板中可以截获到完整的 Prompt 和响应内容。server-runner 将整个 Loop 放到服务端，前端只消费 SSE 事件流，API Key 和完整的上下文永远不出现在用户设备上。Model Chain 四级降级（DeepSeek Flash → Pro → GLM-4.6V → Qwen-Long）进一步增强了可靠性——单模型不可用时系统能自动切换，用户无需关心底层用的是哪个模型。

双 Runner 架构（client-runner + server-runner）的设计也体现了一个务实的工程原则：**渐进式迁移而非大爆炸重构**。保留 client-runner 作为调试和降级通道，意味着在生产环境切换到 server-runner 后，如果遇到未预见的边缘情况，系统可以随时回退到原有架构。这种"飞行中换引擎"的策略在分布式系统中被称为 Strangler Fig Pattern，在这里被应用到了一个 AI Agent 架构的升级中。

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
| **评估持久化** | `/api/agent/persist-eval`、`/api/report/save`、`/api/data/jds`、`/api/data/reports` | Dexie 降级缓存 |
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
const runner = agentLoopServer({
  agent, systemPrompt, messages,
  tools, signal: request.signal
});
for await (const event of runner) {
  if (aborted) break;
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

### 3.1 MODEL_CHAIN 四级降级链

服务端直连四家大模型，按优先级依次尝试：

```
const MODEL_CHAIN = [
  { model: "deepseek-v4-flash",  url: "https://api.deepseek.com/chat/completions",    keyEnv: "DEEPSEEK_API_KEY" },
  { model: "deepseek-v4-pro",    url: "https://api.deepseek.com/chat/completions",    keyEnv: "DEEPSEEK_API_KEY" },
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
  │     ├─ fetch POST (含 tools 定义、stream: true, AbortSignal.timeout(60s))
  │     ├─ 网络异常？ → catch → continue (切换到下一模型)
  │     ├─ 429/503？ → 重试 1 次（间隔 1s）
  │     ├─ 超时 (AbortError)？ → 切换到下一模型
  │     ├─ 其他 4xx/5xx？ → 不重试，跳过
  │     └─ 200？ → 解析 stream → 返回 {text, toolCalls}
  │
  ├─ [2] deepseek-v4-pro   ← Flash 失败后尝试
  │     └─ 同上逻辑
  │
  ├─ [3] glm-4.6v-flashx   ← Pro 失败后尝试
  │     └─ 同上逻辑
  │
  ├─ [4] qwen-long          ← GLM 失败后尝试
  │     └─ 同上逻辑
  │
  └─ 全部失败 → throw Error("All models failed (last: {lastError})")
```

**关键细节：**
- 每层内部对 429（限流）和 503（服务不可用）重试 1 次，间隔 1 秒
- fetch 包裹 try/catch，网络异常（DNS/连接拒绝/超时）捕获后切换到下一模型
- `AbortSignal.timeout(60_000)` 防止 TCP 层挂死
- 非临时性错误（400/401/403/500）不重试，直接跳到下一层
- 如果某层 API Key 环境变量未配置，静默跳过
- 最终失败时抛出包含最后错误信息的异常，Loop 层捕获后发送 `text` 事件告知用户

### 3.2 流式响应解析（行缓冲模式）

API 均返回 `stream: true` 的 SSE 流。解析过程使用 line-buffer 模式防止 TCP 分包截断：

```
SSE Stream Buffer 解析

  bytes arrive...
      │
      ▼
  TextDecoder.decode(value, {stream: true})
      │
      ▼
  lineBuf += chunk
      │
      ▼
  lines = lineBuf.split("\n")
  lineBuf = lines.pop() || ""    ← 保留跨 chunk 的碎片行
      │
      ├─ "data: {...JSON...}"  → JSON.parse → 提取 delta
      ├─ "data: [DONE]"        → 忽略
      └─ "" 或其他             → 忽略
      ▼
  delta 字段处理:
      │
      ├─ delta.content        → fullText += delta.content
      │
      └─ delta.tool_calls[]   → 按 index 累积到 toolCallFragments Map
            ├─ tc.id           → frag.id = tc.id
            ├─ tc.function.name     → frag.name += tc.function.name
            └─ tc.function.arguments → frag.arguments += tc.function.arguments

  ← 流结束后 drain 残留 lineBuf，确保 finish_reason 不丢失

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
agentLoopServer({ systemPrompt, messages, config, tools, agent, signal }):

  state = { iteration:0, consecutiveFailures:0, contextSize, phase:"understanding" }
  ctx = messages
  autoRetryCount = 0
  recentCalls = []

  while state.iteration < config.maxIterations (默认 5):

    ┌─ Abort 检查 ──────────────────────────────┐
    │ if signal?.aborted:                         │
    │   yield { type:"done" }; return             │
    └─────────────────────────────────────────────┘

    state.iteration++

    ┌─ 上下文截断 ──────────────────────────────┐
    │ if contextSize > MAX_CONTEXT_TOKENS (64000)  │
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
│                    防御层 1: forceTextOnly                │
│  工具返回 permanent 错误                                  │
│  → forceTextOnly = true（代码级拦截）                     │
│  → 下一轮 LLM 只能文本输出，tool_calls 被忽略             │
│  → 触发条件：errorCategory = "permanent" | "need_user_input" │
├─────────────────────────────────────────────────────────┤
│                    防御层 2: 连续失败                     │
│  consecutiveFailures >= 2                                │
│  → "工具连续失败 N 次，请检查配置或稍后重试。"             │
│  → done                                                  │
│  触发条件：forceTextOnly 未拦截到的重复 failure            │
├─────────────────────────────────────────────────────────┤
│                    防御层 3: 自动重试上限                  │
│  autoRetryCount > MAX_AUTO_RETRY (2)                     │
│  → "搜索暂不可用，以下是我基于已有知识的分析："             │
│  → done                                                  │
│  触发条件：结果为空/不相关（工具执行成功了但结果质量差）     │
└─────────────────────────────────────────────────────────┘
```

### 4.3 配置常量

| 常量 | 值 | 位置 | 说明 |
|------|-----|------|------|
| `DEFAULT_LOOP_CONFIG.maxIterations` | 5 | `types.ts` | 最大 ReAct 迭代轮数 |
| `MAX_CONTEXT_TOKENS` | 64000 | 两个 runner | 上下文 token 上限（CJK 感知估算） |
| `DEFAULT_TOOL_CTX_CAP` | 800 | 两个 runner | 工具结果推入 LLM 上下文的默认字符上限 |
| `MAX_AUTO_RETRY` | 2 | 两个 runner | 空/不相关结果最大自动重试次数 |
| `LLM_TIMEOUT` | 60s | `server-runner.ts` | 单次 API 请求超时 |
| `TOOL_PARALLEL_TIMEOUT` | 30s | `client-runner.ts` | 并行工具执行超时 |
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

### 5.2 错误分类与 forceTextOnly 机制

工具通过 `errorCategory` 字段控制 Agent Loop 行为：

```typescript
type ErrorCategory = "ok" | "transient" | "permanent" | "need_user_input";
```

**resolveErrorCategory fallback**：未显式设置时，`success=true → "ok"`，`success=false → "permanent"`。

**forceTextOnly 机制**：工具返回 permanent 错误 → Agent Loop 设置 `forceTextOnly = true` → 下一轮 LLM 只能输出文本回复。**代码级拦截**——LLM 返回的 tool_calls 被直接忽略，不是依赖文本指令"请"LLM 停止。

**不同失败模式的行为：**

| 场景 | errorCategory | Loop 行为 |
|------|-------------|-----------|
| 正常成功 | ok | autoRetryCount=0，继续 |
| 网络超时 | transient | autoRetryCount++，LLM 重试最多 2 次 |
| 文件不存在 | permanent | forceTextOnly=true，下一轮 LLM 直接输出文本 |
| 需要用户输入 | need_user_input | forceTextOnly=true，LLM 告知用户需要什么 |
| 搜索无结果 | (success=true) | quality="empty" → autoRetryCount++ |
| 搜索到错误内容 | (success=true) | quality="irrelevant" → autoRetryCount++ |

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
  │ .buildContext │          │ TOKENS = 64000   │
  │               │          │                  │
  │ working: 10轮 │          │ ctx.slice(-15)   │
  │ episodic: 摘要│          │ 保留最近 15 条    │
  │ semantic: 跨  │          │ 消息             │
  │ 会话事实      │          │                  │
  └──────────────┘          └──────────────────┘
```

### 6.2 Token 估算（CJK 感知）

```typescript
function estimateTokens(messages: { role: string; content: string }[]): number {
  // Chinese chars ≈ 1.5-2 tokens, English chars ≈ 0.25 tokens
  // Replace CJK with "aa" to bring ratio to ~1:1 for mixed text
  return messages.reduce((sum, m) =>
    sum + m.content.replace(/[\u4e00-\u9fff]/g, 'aa').length, 0);
}
```

**上下文预算包含系统 prompt 长度**：初始 `contextSize` 计算时加上 `systemPrompt.replace(/[\u4e00-\u9fff]/g, 'aa').length`。

- 触发截断阈值：`state.contextSize > MAX_CONTEXT_TOKENS (64000)`
- 截断方式：保留最近 15 条消息
- 截断后重新估算：`state.contextSize = estimateTokens(ctx)`
- 下一轮迭代时如果仍然超限，再次截断（循环安全）

### 6.3 工具调用去重（安全模式）

```typescript
const recentCalls: { name: string; params: string; result: string }[] = [];
// 容量: 5，FIFO

// 每次工具调用前检查:
const paramsKey = JSON.stringify(params);
const recent = recentCalls.find(
  (c) => c.name === tc.name && c.params === paramsKey
);
if (recent) {
  // 复用缓存结果，不实际执行工具
  toolResult = { success: true, data: recent.result };
  formatted = recent.result;
}
```

**安全规则：只有成功/非降级结果才写入 `recentCalls`**。`degradeToUser` 路径（permanent / need_user_input）的结果不缓存，避免失败结果被重放为成功。写入时机在 error category 分发之后，不在工具执行后立即写入。

**设计意图：** LLM 在后续迭代中可能重复调用同一工具（尤其是搜索工具），去重避免重复 API 请求和资源浪费。缓存容量 5 条覆盖最近一轮迭代的全部工具调用。

### 6.4 上下文组装全链路

```
用户消息到达 POST /api/agent/run
  │
  ├─ 1. orchestrator.orchestrate(userMessage, ctx)
  │     ├─ classifyIntent → 确定子 Agent（通用/评估/简历/面试/画像）
  │     ├─ getCareerDNASummary → 求职 DNA 摘要
  │     ├─ getCVSummary → repository-backed CV 数据（localStorage 仅作缓存）
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
  | { type: "tool_result";      name: string; result: string; success: boolean; data?: unknown; uiPayload?: Record<string,unknown> } // 工具结果
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

### 7.5 评估结果持久化链路

评估类工具的输出不只返回给聊天 UI，也会进入服务端数据层：

1. `evaluate_jd_full` 或评估管道产出 JD 正文、A-G 报告块、分数、风险信号和关键词。
2. `/api/agent/persist-eval` 写入 `applications` 与 `reports`，并在 JD 正文足够完整时写入 `jds`。
3. `/api/report/save` 覆盖人工确认保存场景，可按 `actions.saveJD` 与 `actions.addToTracker` 决定是否保存 JD 和追踪记录。
4. `/api/data/jds` 与 `/api/data/reports` 是评估页统计、JD 库、报告库的第一读取来源；Dexie 只作为 API 不可用时的 fallback。
5. `jds.report_id` 存储公开报告编号 `reports.report_num`，不是内部自增 `reports.id`。

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
| **模型降级** | `MODEL_CHAIN` 四级降级 + 网络异常 fallback | 仅 DeepSeek（通过 think proxy） |
| **LLM API 超时** | `AbortSignal.timeout(60s)` | `fetchFromThinkProxy` 120s 超时 |
| **流式降级** | stream 失败→JSON fallback + SSE 包装 | 无（think proxy 处理） |
| **行缓冲** | ✓ `lineBuf` 模式 | ✓ 已在 `collectThinkResponseStreaming` |
| **CJK token 估算** | ✓ `replace(/[\u4e00-\u9fff]/g, 'aa')` | ✓ 同上 |
| **Token 预算** | 含 systemPrompt 长度 | 含 systemPrompt 长度 |
| **工具去重缓存** | 只缓存成功/非降级结果 | 只缓存成功/非降级结果 |
| **消息截断** | `ctx.slice(-15)` | `truncateContext(ctx, 15)` |
| **Abort 支持** | `request.signal` 传入 orchestrator → Loop | `AbortSignal` + reader `Promise.race` |
| **并行工具超时** | — | `Promise.race` 30s |
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
