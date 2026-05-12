## 1. SSEEvent 类型扩展 (`src/lib/agent/loop/types.ts`)

- [x] 1.1 新增 `block_start` / `block_chunk` / `block_done` / `score` / `overall_score` 事件类型
- [x] 1.2 新增 `search_start` / `search_result` / `error` 事件类型
- [x] 1.3 新增 `persist_done` 事件类型 (reportNum, company, role, score)
- [x] 1.4 扩展 `done` 类型接受 stream API 平铺字段 (company, role, overallScore, blocks, jdText)
- [x] 1.5 `AgentPhase` 新增 extracting_ocr, extracting_jd, jd_extracted, detecting_archetype, archetype_detected

## 2. evaluate_jd_full 工具改造 (`src/lib/agent/tools/action/evaluate-jd-full.ts`)

- [x] 2.1 参数新增 `images?: string[]`
- [x] 2.2 调用目标切换到 `/api/evaluate/stream` (传 jdText, jdUrl, images)
- [x] 2.3 handler 返回 `{ success: true, data: { _stream: res.body }, _streaming: true }` (不读 body)
- [x] 2.4 HTTP error 时返回 `{ success: false, error, recoverable, retryHint }`
- [x] 2.5 删除所有 `dispatchProgress` / `CustomEvent` / `eval-progress` 代码
- [x] 2.6 `formatResult` 保留（client-runner 调用 formatToolResult 时使用）

## 3. client-runner Stream Delegation (`src/lib/agent/loop/client-runner.ts`)

- [x] 3.1 `executeTool` 返回后检查 `_streaming` 标志
- [x] 3.2 Stream 路径：`reader = stream.getReader()` → 循环读取 SSE chunks → 逐事件 `yield`
- [x] 3.3 从 `done` 事件提取 finalData（flat fields: company, role, overallScore, blocks）
- [x] 3.4 Stream 完成后调 `/api/agent/persist-eval` → yield `persist_done` 事件
- [x] 3.5 Error 处理：`reader.cancel()` on abort; `try/finally` releaseLock
- [x] 3.6 `collectThinkResponse` → `collectThinkResponseStreaming` (generator, 边读 SSE 边 yield text chunk)
- [x] 3.7 client-runner 调用处改为 `for await (const event of collectThinkResponseStreaming(...))`
- [x] 3.8 删除预览循环 (4-char/chunk, lines 227-236)

## 4. AgentChat UI 改造 (`src/components/agent/AgentChat.tsx`)

- [x] 4.1 AgentStatusBar：删除 `eval-progress` CustomEvent 监听器 (lines 200-227)
- [x] 4.2 AgentStatusBar：新增 `evalProgress` prop (`Array<{block, label, status, score?}>`)
- [x] 4.3 AgentStatusBar：用 evalProgress 渲染板块状态行 (A·概览 ✓4.2 · B·匹配 ⏳ ...)
- [x] 4.4 新增 `EvalCompletionNotice` 组件 (compact 通知: 评估完成 · 公司—岗位 · 分数 · 报告编号)
- [x] 4.5 MessageBubble tool 角色：删除 `evaluate_jd_full` → `EvalConfirmCard` 特殊路由 (lines 488-492)
- [x] 4.6 EvalConfirmCard 组件保留代码但不再被路由（后续可考虑废弃）

## 5. page.tsx 事件处理 (`src/app/agent/page.tsx`)

- [x] 5.1 `showAsCard` 列表中删除 `"evaluate_jd_full"` (line 275)
- [x] 5.2 新增 `evalProgress` 状态 (block state map)
- [x] 5.3 新增 `completionInfo` 状态 (reportNum, company, role, score)
- [x] 5.4 event switch 新增 case: block_start → 追加/更新 evalProgress
- [x] 5.5 event switch 新增 case: block_done → 更新状态为 done
- [x] 5.6 event switch 新增 case: score → 更新分数
- [x] 5.7 event switch 新增 case: persist_done → setCompletionInfo
- [x] 5.8 streaming 结束时 reset evalProgress (setEvalProgress([]))
- [x] 5.9 将 evalProgress / completionInfo 传给 AgentChat

## 6. 持久化 API (`src/app/api/agent/persist-eval/route.ts`) [新文件]

- [x] 6.1 POST handler 接收 { company, role, overallScore, archetype, blocks, keywords, legitimacy, date }
- [x] 6.2 调 `upsertApp` + `upsertReport` (from server-db)
- [x] 6.3 返回 `{ success: true, reportNum }`

## 7. 风险扫描注入 (`src/app/api/evaluate/stream/route.ts`)

- [x] 7.1 Block G 循环中前置调 `/api/agent/scan-risks`
- [x] 7.2 emit `search_start` 事件 (避免沉默等待)
- [x] 7.3 scan-risks 结果注入 `bp.sys` (追加风险信号文本)

## 8. 验证

- [ ] 8.1 粘贴完整 JD 文本 → A-G 进度逐块出现 → 摘要 typewriter 效果 → 完成通知
- [ ] 8.2 评估中途点"新建对话" → stream 被 abort (reader.cancel)
- [ ] 8.3 刷新后查看历史会话 → tool message JSON data 可读
- [ ] 8.4 报告库页 → 新评估结果已持久化
