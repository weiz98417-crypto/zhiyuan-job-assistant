## Context

`/api/evaluate/stream/route.ts` 已实现真正的逐板块流式评估（OCR→archetype→A-G逐块SSE），但 `evaluate_jd_full` 工具未使用它，走的是旧阻塞路径 `/api/evaluate` → `/api/agent/evaluate-pipeline`。事件通道割裂：进度走 CustomEvent+flushSync，工具结果走 SSE generator，LLM 文本走 think proxy SSE。

完整设计文档：`C:\Users\Administrator\.gstack\projects\weiz98417-crypto-zhiyuan-job-assistant\Administrator-master-design-20260512-143000.md`

## Core Architecture Decision: Stream Delegation Pattern

问题：工具 handler（async function）调用 `/api/evaluate/stream` 获得 ReadableStream，但 handler 不能 yield。评估进度事件必须在工具执行期间 yield 给 generator。

解决方案：handler 不读取 stream，将 `res.body` (ReadableStream) 附加到 `ToolResult.data._stream` 返回。client-runner generator 读取流并逐事件 yield。

```
tool handler → fetch("/api/evaluate/stream") → return { data: { _stream: res.body } }
                                                              ↓
client-runner generator → reader = stream.getReader() → while(read) → yield SSEEvent
```

## Goals

- A-G 评估进度真正实时：每板块开始时 UI 立即看到状态更新
- 摘要文本 typewriter 效果：LLM 生成第一个 token 就显示
- 保存通知在摘要后出现：不打断流式输出
- 事件通道统一：全部走 generator SSE，删除 CustomEvent 路径

## Changes

### 1. SSEEvent 类型扩展 (`types.ts`)

新增事件类型（复用 stream API 原有事件名）：
- `block_start`, `block_chunk`, `block_done`, `score`, `overall_score`
- `search_start`, `search_result`, `error` (block?: string)
- `persist_done` (reportNum, company, role, score)
- 扩展 `done` 类型接受 stream API 平铺字段 (company, role, overallScore, blocks, jdText)
- `AgentPhase` 新增: extracting_ocr, extracting_jd, jd_extracted, detecting_archetype, archetype_detected

### 2. evaluate_jd_full 工具改造

- 调用目标：`/api/evaluate/stream` (已存在的真流式 API)
- 新增 `images` 参数
- handler 返回 `{ _stream: res.body }`，不读取 body
- 删除所有 CustomEvent dispatch 代码

### 3. client-runner Stream Delegation

- `executeTool` 返回后检查 `_streaming` 标志
- 如有 stream：`reader = stream.getReader()` → 循环读取 SSE chunks → yield 事件 → 提取 done 事件中的 finalData
- 如无 stream：现有逻辑不变
- `collectThinkResponse` → `collectThinkResponseStreaming` (generator，边读边 yield text)
- 删除预览循环 (4-char/chunk, lines 227-236)

### 4. AgentChat UI 改造

- AgentStatusBar：删 CustomEvent 监听，改 `evalProgress` prop 驱动
- `EvalConfirmCard` 路由删除（`evaluate_jd_full` 从 tool 消息处理中移除）
- 新增 `EvalCompletionNotice` 组件（compact 通知，包含报告编号和查看入口）

### 5. page.tsx 事件处理

- `showAsCard` 列表中删除 `evaluate_jd_full`
- 新增 evalProgress + completionInfo 状态
- 新增 `block_start`/`block_done`/`score`/`persist_done` 事件 case
- streaming 结束时 reset evalProgress

### 6. 持久化 API (新文件)

`/api/agent/persist-eval` — POST，接收 { company, role, overallScore, archetype, blocks, keywords, legitimacy, date }，执行 upsertApp + upsertReport，返回 { reportNum }

### 7. 风险扫描注入 stream API

`/api/evaluate/stream/route.ts` block G：先调 `/api/agent/scan-risks`，结果注入 block G prompt，emit `search_start` 事件避免沉默等待。
