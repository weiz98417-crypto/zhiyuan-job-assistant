## Context

DeepSeek V4 Flash 通过 `/api/agent/think` 代理接收 system prompt + 消息列表。prompt 中包含了 `<<TOOL>>` 和 `<<PLAN>>` 格式规范，但模型倾向于忽略这些自定义标记，直接返回自然语言 markdown。

当前架构：
```
page.tsx → buildAgentSystemPrompt() → agentLoopClient() → fetchFromThinkProxy()
                                                              ↓
                                                         /api/agent/think
                                                              ↓
                                                         DeepSeek API (stream)
                                                              ↓
                                                         collectThinkText()
                                                              ↓
                                                         parsePlan() / parseToolCall()
                                                              ↓
                                                         executeTool() → 12 个手写工具
```

问题集中在三个环节：
1. **Prompt 设计**：把工具调用描述为"建议"而非强制协议，缺乏具体示例
2. **解析容错**：正则要求精确格式，LLM 的微小偏差就导致解析失败
3. **工具覆盖**：只有 12 个求职核心工具，缺乏通用查询能力

## Goals / Non-Goals

**Goals:**
- DeepSeek 可靠输出 `<<TOOL>>`（目标 >80% 触发率）和 `<<PLAN>>` 标记
- 解析器容忍常见 LLM 格式变体
- 纯聊天场景不显示空的 PlanCard
- 集成 3 个 MCP Server，工具总数从 12 → 20+
- MCP 工具自动注册，无需手动维护 prompt 中的工具描述

**Non-Goals:**
- 不使用 DeepSeek 原生 function calling —— text-based 协议可跨模型迁移
- 不切换模型
- MCP 集成不改变现有 `<<TOOL>>` 标记协议 —— MCP 工具对 agent 透明，调用路径与现有工具一致

## Decisions

### Decision 1: Few-shot 示例 > 规则描述

在 prompt 中嵌入多个完整对话示例（tool call、multi-step plan、纯聊天），替代规则列表。LLM 通过模仿学习远优于遵循抽象指令。

### Decision 2: 三层解析策略

1. 精确匹配（当前正则）
2. 宽松匹配 — 剥离 markdown code fence，容忍空白
3. 启发式提取 — 全文搜索 marker，取最后一次出现

### Decision 3: max_tokens 2000 → 4096

Few-shot + MCP 工具列表占用约 800 tokens，剩余空间不足以容纳复杂计划。翻倍保障输出空间。

### Decision 4: PlanCard 条件渲染

PlanCard 仅在 parsePlan 成功时显示。移除 no-plan 回退中的假任务。

### Decision 5: MCP 集成架构

**选择：服务端 MCP 客户端 + HTTP 代理模式**

```
┌─ Browser ──────────────────────────────────────────┐
│  agentLoopClient()                                  │
│    ↓                                                │
│  executeTool("serpapi_google_search", {...})        │
│    ↓ fetch                                          │
│  POST /api/agent/mcp/call                           │
└────────────────────────────────────────────────────┘
                    ↓
┌─ Next.js Server ───────────────────────────────────┐
│  /api/agent/mcp/call/route.ts                       │
│    ↓                                                │
│  MCPManager.callTool(serverName, toolName, params)  │
│    ↓ stdio/HTTP                                     │
│  MCP Server Process (SerpAPI / Baidu Map / mcp-jobs)│
└────────────────────────────────────────────────────┘
```

**理由**：
- MCP 使用 stdio transport，只能在 Node.js 服务端运行
- 浏览器通过 HTTP 代理调用，与现有 `executeTool()` 模式完全兼容
- MCP 工具和手写工具在 agent 视角无区别——都是 `<<TOOL>>name\n{params}\n<</TOOL>>`

**替代方案**：
- 浏览器端 MCP（WebSocket transport）—— MCP SDK 尚未稳定支持
- 每个工具单独写 API route —— 重复劳动，不如统一代理

### Decision 6: MCP Server 选型

| MCP Server | 提供的能力 | 接入方式 | 认证 |
|---|---|---|---|
| **SerpAPI MCP** | Google/Bing/Baidu 多引擎搜索 | npm: `@serpapi/mcp-server` | `SERPAPI_API_KEY` |
| **Baidu Map MCP** | 天气查询、地点搜索、路线规划 | npm: `@baidumap/mcp-server-baidu-map` | `BAIDU_MAP_API_KEY` |
| **mcp-jobs** | 中国招聘网站聚合搜索 | npm: `@iflow-mcp/mergedao-mcp-jobs` | 免 key |

**工具注册流程**：

```
服务启动
  → MCPManager.init()
    → 连接 SerpAPI MCP → 发现 ~3 个搜索工具
    → 连接 Baidu Map MCP → 发现 ~5 个地图/天气/路线工具
    → 连接 mcp-jobs → 发现 ~2 个招聘搜索工具
  → 自动注册到 toolRegistry
  → buildAgentSystemPrompt() 自动包含所有工具
```

### Decision 7: MCP 配置

MCP Server 配置通过环境变量 + JSON config 管理：

```json
// mcp.config.json (版本控制，不含 secrets)
{
  "servers": {
    "serpapi": {
      "package": "@serpapi/mcp-server",
      "env": { "SERPAPI_API_KEY": "env:SERPAPI_API_KEY" }
    },
    "baidu-map": {
      "package": "@baidumap/mcp-server-baidu-map",
      "env": { "BAIDU_MAP_API_KEY": "env:BAIDU_MAP_API_KEY" }
    },
    "mcp-jobs": {
      "package": "@iflow-mcp/mergedao-mcp-jobs"
    }
  }
}
```

**理由**：配置与代码分离，新增 MCP Server 只需改 JSON 配置和环境变量，不改代码。

## Risks / Trade-offs

- **[Risk] MCP Server 进程管理** → Next.js 无内置进程管理器。Mitigation：MCPManager 在首次 API 调用时惰性初始化，每个 MCP Server 作为 child_process 运行，带自动重连
- **[Risk] MCP Server 版本兼容性** → MCP 协议仍在演进。Mitigation：锁定 SDK 和 Server 版本，使用 MCP 1.x 稳定版
- **[Risk] 冷启动延迟** → 首次工具调用需初始化 MCP 连接（~1-2s）。Mitigation：惰性初始化 + 连接池复用
- **[Risk] mcp-jobs 可能不稳定** → 依赖第三方爬虫。Mitigation：标注为可选，失败不影响其他工具
- **[Risk] `@modelcontextprotocol/sdk` 增加约 200KB bundle** → 仅服务端使用，不影响客户端 bundle size
- **[Risk] Few-shot 示例增加 ~500 tokens/请求** → 成本增加约 5%。Mitigation：简洁示例
