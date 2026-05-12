## Why

JD评估功能存在三个体验断裂点，根因是事件通道割裂（CustomEvent + SSE generator + LLM text 三条路径各自为政）：

1. **A-G进度是假的**：`evaluate_jd_full` → `/api/evaluate`（阻塞式，7板块一次性返回），pipeline 用 200ms 延迟逐块发 `block_start` 模拟进度。用户等待期间只看到旋转图标。
2. **摘要流式输出卡住**：`collectThinkResponse` 全量缓冲 LLM 响应后再逐字 yield。第二轮 "reflecting" 阶段是另一个长等待。
3. **保存按钮在摘要前弹出**：`EvalConfirmCard` 在 tool result 消息中即时渲染，此时 LLM 还在生成摘要。

关键发现：`/api/evaluate/stream/route.ts` 已实现真流式逐板块评估（OCR → archetype → A-G 逐块 SSE），但没有任何工具调用它。

## What Changes

1. **Stream Delegation Pattern** — `evaluate_jd_full` 切换到 `/api/evaluate/stream`，handler 返回 `_stream`，client-runner 读取流并 yield 事件，实现真正的实时 A-G 进度
2. **collectThinkResponse 真流式** — 改为 generator，边读 SSE chunk 边 yield text，LLM 生成第一个 token 用户就能看到
3. **保存通知在摘要后** — 删 `EvalConfirmCard`（tool result 即时渲染），新增 `EvalCompletionNotice`（摘要完成后渲染）；新 `/api/agent/persist-eval` 端点处理持久化
4. **删除 CustomEvent 通道** — AgentStatusBar 改为 props 驱动，删除 `eval-progress` 事件监听和 `flushSync`
5. **Block G 注入风险扫描** — `/api/evaluate/stream` 的 block G 前调用 scan-risks API，结果注入 prompt

## Capabilities

- `stream-delegation`: handler 返回 ReadableStream，generator 逐事件 yield 到 UI
- `true-streaming-think`: collectThinkResponse 边读 SSE 边产出 text chunk
- `eval-completion-notice`: 评估完成后内联通知，包含报告编号和查看入口
- `persist-eval-endpoint`: 独立持久化 API，从 evaluate-pipeline 提取
- `risk-scan-in-block-g`: stream API block G 前置风险扫描

## Impact

- **修改**: `src/lib/agent/loop/types.ts` — SSEEvent + AgentPhase 扩展
- **修改**: `src/lib/agent/tools/action/evaluate-jd-full.ts` — 切换 stream API，删 CustomEvent
- **修改**: `src/lib/agent/loop/client-runner.ts` — Stream Delegation + 流式 collectThinkResponse
- **修改**: `src/components/agent/AgentChat.tsx` — 删 CustomEvent 监听，新 EvalCompletionNotice
- **修改**: `src/app/agent/page.tsx` — eval 事件处理 + showAsCard 修复
- **新增**: `src/app/api/agent/persist-eval/route.ts` — 持久化端点
- **修改**: `src/app/api/evaluate/stream/route.ts` — block G 注入风险扫描
- **可废弃**: `src/app/api/agent/evaluate-pipeline/route.ts`
