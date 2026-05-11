## Why

DeepSeek V4 Flash 无视自定义的 `<<TOOL>>` 和 `<<PLAN>>` 标记，直接返回自然语言文本。导致 Agent Loop 从不执行工具调用，PlanCard 始终回退到单一的"执行请求"任务，整个 agent 沦为纯聊天机器人。测试证明：同一请求下，DeepSeek 输出 746 字符的 markdown 分析，既不调用 `evaluate_jd` 也不输出 `<<PLAN>>`。

另外，当前工具系统只有 12 个求职核心工具。意图边界采用求职最大化原则后，agent 需要对"明天天气""这家公司怎么样"等问题调用工具，但找不到——只能回退聊天。需要补齐通用查询能力。

调研发现：Baidu Map MCP（天气+路线+地点）、SerpAPI MCP（多引擎搜索含百度）、mcp-jobs（中国招聘网站聚合）等现成 MCP 服务正好覆盖这些缺口。与其手写，不如接入 MCP 生态。

## What Changes

- **重写 system prompt**：将工具/计划调用从"建议"升级为"强制协议"，加入 few-shot 示例和求职最大化意图边界
- **强化标记解析**：`parsePlan` / `parseToolCall` 三层解析（精确 → 宽松 → 启发式），容忍 LLM 格式变体
- **优化回退路径**：纯聊天时不显示 PlanCard，直接流式文本
- **增加 `max_tokens`**：2000 → 4096
- **集成 MCP 客户端**：接入 SerpAPI MCP（搜索）、Baidu Map MCP（天气+地图+路线）、mcp-jobs（中国招聘站点搜索），工具总数从 12 → 20+
- **删除手写工具**：`web_search` 和 `get_weather` 由 MCP 替代，不自己写

## Capabilities

### New Capabilities
- `agent-prompt-protocol`: 基于 prompt 的工具调用协议，通过严格格式指令 + few-shot 示例驱动 DeepSeek 可靠输出 `<<TOOL>>` 和 `<<PLAN>>` 标记
- `agent-tools-expansion`: 通过 MCP 协议集成外部工具（SerpAPI 搜索、Baidu Map 天气/路线、mcp-jobs 中国招聘聚合），工具注册表自动同步

### Modified Capabilities
<!-- No existing specs cover this area -->

## Impact

- `src/lib/agent/prompt.ts` — 重写 AGENT_CORE_PROMPT，加入 few-shot 示例和求职最大化意图边界
- `src/lib/agent/loop/client-runner.ts` — 增强 parsePlan/parseToolCall，优化 no-plan 回退逻辑
- `src/app/api/agent/think/route.ts` — max_tokens 2000 → 4096
- `src/components/agent/AgentChat.tsx` — PlanCard 条件渲染
- `src/lib/agent/mcp/` — **新增** MCP 客户端模块（manager、tools、config）
- `src/app/api/agent/mcp/call/route.ts` — **新增** MCP 工具调用代理 API
- `src/lib/agent/tools/index.ts` — 注册 MCP 工具
- `package.json` — 新增 `@modelcontextprotocol/sdk` 依赖
- `.env.example` — 新增 MCP 相关环境变量（BAIDU_MAP_API_KEY, SERPAPI_API_KEY）
