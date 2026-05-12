## 1. server-runner.ts — 服务端 ReAct 循环

- [x] 1.1 新建 `frontend/src/lib/agent/loop/server-runner.ts`
- [x] 1.2 从 client-runner.ts 移植核心逻辑：质量门控（checkResultQuality）、上下文截断（truncateContext）、自动重试（autoRetryCount, MAX_AUTO_RETRY）
- [x] 1.3 直接调 DeepSeek API（`fetch("https://api.deepseek.com/chat/completions")` + API key）替代 `/api/agent/think` 代理
- [x] 1.4 工具执行走 `registry.execute(name, params)` 替代 `fetch()` 代理
- [x] 1.5 async generator 签名与 client-runner 兼容（yield SSEEvent）

## 2. /api/agent/run — SSE 端点

- [x] 2.1 新建 `frontend/src/app/api/agent/run/route.ts`
- [x] 2.2 接收 `{ sessionId, messages }` → 调 orchestrator → 获取 systemPrompt/tools/whitelist
- [x] 2.3 创建 ReadableStream，内部运行 server-runner，SSE 编码后写入 stream
- [x] 2.4 处理请求中断（request.signal），当前工具完成后终止

## 3. 浏览器端工具桥接

- [x] 3.1 新建 `/api/agent/data/applications/route.ts`（及其他需要的 data 端点）——为原 IndexedDB 工具提供 API 桥接
- [x] 3.2 修改 6 个 query 工具的 handler：从 IndexedDB 直接访问改为 `fetch("/api/agent/data/...")`

## 4. page.tsx 简化

- [x] 4.1 删除 `agentLoopClient` import 和调用代码
- [x] 4.2 删除 `<<TOOL>>` / `parseToolCall` 相关引用
- [x] 4.3 替换为 `fetch("/api/agent/run", { method: "POST", body: JSON.stringify({ sessionId, messages }) })` + SSE 解析
- [x] 4.4 保留现有 SSE 事件处理逻辑（tool_call / tool_result / text / phase / done 渲染不变）

## 5. 清理

- [x] 5.1 删除 `frontend/src/lib/agent/loop/client-runner.ts`
- [x] 5.2 更新 `frontend/src/lib/agent/loop/types.ts`（移除浏览器特有类型，如 AbortSignal 引用）

## 6. 验证

- [x] 6.1 发送"评估这个 JD" → 服务端执行 `evaluate_jd_full` → SSE 流正常返回
- [x] 6.2 关闭浏览器标签页，检查服务端日志——工具调用完成 + 数据库写入成功
- [x] 6.3 `page.tsx` 中无 `agentLoopClient`、`parseToolCall`、`<<TOOL>>` 引用
- [x] 6.4 全部现有工具（20 个 + 新增 6 个）通过服务端循环正常调用
- [x] 6.5 工具调用延迟较客户端版本更低（消除 fetch 代理往返）
