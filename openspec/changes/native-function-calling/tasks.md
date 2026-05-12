## 1. ToolRegistry — toOpenAITools() 序列化

- [x] 1.1 在 `frontend/src/lib/agent/tools/registry.ts` 的 `ToolRegistry` 类中新增 `toOpenAITools()` 方法
- [x] 1.2 方法遍历 `this.tools`，将每个 `ToolDefinition` 转换为 `{ type: "function", function: { name, description, parameters: { type: "object", properties, required } } }` 格式
- [x] 1.3 `required` 数组只包含 `ToolParameter.required === true` 的参数名

## 2. /api/agent/think — Native Tools 支持

- [x] 2.1 请求体新增 `tools` 参数解析（`frontend/src/app/api/agent/think/route.ts`）
- [x] 2.2 DeepSeek 请求体在 `tools` 有值且非空时包含 `tools` 字段
- [x] 2.3 新增流式 `delta.tool_calls[]` 解析——用 `Map<number, {id, name, arguments}>` 按 index 累积片段
- [x] 2.4 流结束前，如 `toolCallFragments.size > 0`，产出 `{ type: "tool_calls", tool_calls: [...] }` SSE 事件
- [x] 2.5 删除 `<<TOOL>>` 标签清理逻辑（`content.replace(/<<TOOL>>[\s\S]*?<<\/TOOL>>/g, "")`）
- [x] 2.6 将 `role: "tool"` 转换为 `role: "user"` 的逻辑改为使用原生 `role: "tool"` + `tool_call_id`

## 3. client-runner.ts — 替换 parseToolCall

- [x] 3.1 `collectThinkText()` 改为 `collectThinkResponse()`，返回 `{ text, toolCalls }` 两个字段，消费新增的 `tool_calls` SSE 事件
- [x] 3.2 `fetchFromThinkProxy()` 新增 `tools` 参数，传入请求体
- [x] 3.3 `agentLoopClient()` 签名新增 `tools` 参数
- [x] 3.4 主循环中：`toolCalls.length === 0` → 回复文本；否则遍历 `toolCalls` 逐个执行
- [x] 3.5 删除 `parseToolCall()` 函数（含 `TOOL_RE_EXACT`、`stripCodeFences()`、`findLastMarker()`）
- [x] 3.6 删除 `extractThinkingContent()` 中与 `<<TOOL>>` 相关的内容提取逻辑

## 4. RESEARCH_PROTOCOL 清理

- [x] 4.1 删除 `RESEARCH_PROTOCOL` 常量中的 `<<TOOL>>` 格式指令和语法示例（第 122-138 行部分）
- [x] 4.2 保留研究策略部分（实体拆分、先发现再深入、验证结果质量）
- [x] 4.3 移除 `injectResearchProtocol()` 中对 `【最高优先级指令` 的检查逻辑

## 5. Orchestrator + Page 集成

- [x] 5.1 `orchestrator/index.ts` 的 `OrchestratorResult` 新增 `tools` 字段
- [x] 5.2 `orchestrate()` 调用 `registry.toOpenAITools()` 并按 whitelist 过滤，写入 `tools`
- [x] 5.3 `page.tsx` 从 `orchestrate()` 解构 `tools`，传入 `agentLoopClient()`

## 6. 验证

- [ ] 6.1 发送"评估这个 JD: [文本]" → 验证 DeepSeek 返回 `tool_calls`（非 `<<TOOL>>` 文本）
- [ ] 6.2 发送"查投递" → 验证 `search_applications` 工具被 native function calling 触发
- [ ] 6.3 发送"你好" → 验证无 `tool_calls`，纯文本回复正常
- [ ] 6.4 检查浏览器 Console 无 `parseToolCall` 或 `<<TOOL>>` 相关错误
- [ ] 6.5 现有 5 个子 agent 路由和无工具场景均正常
