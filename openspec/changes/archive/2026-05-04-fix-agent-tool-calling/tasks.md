## 1. 重写 System Prompt（prompt.ts）

- [x] 1.1 将工具调用从"聊天引导中的一项"提升为"核心协议"，用强制性语言重写全文
- [x] 1.2 加入意图边界规则：求职最大化原则 — 凡是可能跟求职沾边的都走工具路径，只有明确无关的才纯聊天
- [x] 1.3 加入 3 个 few-shot 示例（完整 user/assistant 对话：`<<TOOL>>` 单步、`<<PLAN>>` 多步、纯聊天）
- [x] 1.4 加入 negative examples：展示错误格式 vs 正确格式
- [x] 1.5 工具调用格式说明放到 prompt 最前面，用 `## 核心规则` 标题

## 2. 增强标记解析（client-runner.ts）

- [x] 2.1 `TOOL_RE` 容忍 `<<TOOL>>` 前后有空白、无换行符、包裹在 markdown code fence 的情况
- [x] 2.2 `PLAN_RE` 同理，剥离 code fence 后再尝试 JSON.parse
- [x] 2.3 实现三层解析策略：精确匹配 → 宽松匹配（去 fence/空白）→ 启发式搜索（全文找最后出现的 marker）

## 3. 优化回退路径（client-runner.ts）

- [x] 3.1 移除 no-plan 回退中的假 PlanCard（不再创建 `{ id: "1", title: "执行请求" }` 的单任务）
- [x] 3.2 纯聊天路径：无 `<<TOOL>>` 且无 `<<PLAN>>` 时，直接 `yield text` 流式输出 LLM 响应文本
- [x] 3.3 `plan_created` 事件仅在 `parsePlan` 成功时 yield

## 4. max_tokens 调整（think/route.ts）

- [x] 4.1 `max_tokens` 从 2000 改为 4096

## 5. MCP 客户端基础设施

- [x] 5.1 安装 `@modelcontextprotocol/sdk` 依赖
- [x] 5.2 创建 `src/lib/agent/mcp/config.ts` — MCP 配置加载（读取 mcp.config.json + 环境变量）
- [x] 5.3 创建 `src/lib/agent/mcp/manager.ts` — MCPManager 类：惰性初始化、连接管理、工具发现、自动重连
- [x] 5.4 创建 `src/lib/agent/mcp/tools.ts` — MCP 工具包装器，将 MCP 工具注册到 agent tool registry
- [x] 5.5 创建 `src/app/api/agent/mcp/call/route.ts` — POST 端点，代理浏览器工具调用到服务端 MCP

## 6. 集成 MCP Server（配置 + 注册）

- [x] 6.1 创建 `mcp.config.json` — 配置 3 个 MCP Server（serpapi、baidu-map、mcp-jobs）
- [x] 6.2 在 `src/lib/agent/tools/index.ts` 中集成 MCP 工具注册
- [x] 6.3 更新 `.env.example` 添加 `SERPAPI_API_KEY` 和 `BAIDU_MAP_API_KEY`

## 7. PlanCard 条件渲染（AgentChat.tsx + page.tsx）

- [x] 7.1 page.tsx 中 `planState` 仅在收到 `plan_created` 事件时设置
- [x] 7.2 AgentChat 中 PlanCard 渲染仅在 `planState` 非 null 且 `tasks.length > 0` 时触发

## 8. 验证

- [x] 8.1 `npx tsc --noEmit` — 0 errors
- [x] 8.2 `npx next build` — 通过
- [ ] 8.3 手动测试：发送"查投递" → agent 输出 `<<TOOL>>search_applications` → 工具执行 → 结果显示
- [ ] 8.4 手动测试：发送"帮我分析这个JD链接" → agent 输出 `<<PLAN>>` → 多任务逐个执行 → PlanCard 动画
- [ ] 8.5 手动测试：发送"你好，今天心情不好" → 纯聊天回复，无 PlanCard
- [ ] 8.6 手动测试：发送"明天北京什么天气" → agent 调 Baidu Map MCP 天气工具 → 返回天气数据
- [ ] 8.7 手动测试：发送"搜索北京的前端开发岗位" → agent 调 mcp-jobs → 返回招聘列表
- [ ] 8.8 手动测试：发送"字节跳动这家公司怎么样" → agent 调 SerpAPI MCP → 搜索结果 → 综合回复
