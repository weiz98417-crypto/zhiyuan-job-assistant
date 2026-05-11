## Why

面试练习的流式输出仍然不工作，且整个练习对话的 UX 逻辑存在结构性问题。经过代码追踪发现核心矛盾：服务端用严格正则提取 AI 输出格式，格式偏差即静默失败；客户端无 raw fallback 用户什么也看不到。同时练习流程（auto-bootstrap→AI 分析→用户回答→保存）每一步都有逻辑错误。

## What Changes

- **统一 SSE 流式架构**：将 coach/stream 路由改用 `stream-utils.ts` 的 `createStructuredStream`，去掉自维护的重复实现，使用更宽容的 `<<TAG>>...<</TAG>>` 格式替代 `<<SECTION_>>##`
- **增加 raw output 回退**：当正则提取不到结构化 sections 时，将 AI 原始输出直接展示，而非静默丢弃
- **修复练习对话 UX 流程**：去掉 auto-bootstrap 自动发送，改为先展示题目信息 + 让用户输入回答 → 然后调用 AI 评分/指导
- **修复保存逻辑**：只保存用户的回答内容作为 answer，AI 反馈单独存储或仅保存最后一条用户消息
- **评估/jd 流式客户端泛化**：让 `parseSSEStream` 可复用于多种结构化流式场景

## Capabilities

### New Capabilities

- `stream-fallback`: 流式输出的稳健回退机制——当结构化提取失败时展示原始 AI 输出
- `practice-dialogue-flow`: 练习对话的正确交互流程——用户先回答，AI 再评分指导

### Modified Capabilities

- `interview-prep-ui`: 面试练习面板的交互流程变更（从自动引导改为用户先输入）；题目列表中的练习按钮连带影响

## Impact

- `src/app/interview/PracticePanel.tsx` — 移除 auto-bootstrap，重构对话流程
- `src/app/interview/page.tsx` — handlePracticeSaved 修复保存逻辑
- `src/app/api/interview/coach/stream/route.ts` — 重构为使用共享 streaming 工具，放宽格式要求，增加 raw fallback
- `src/lib/stream-utils.ts` — 扩展 `createStructuredStream` 支持 coach 场景的 followUps/riskWarnings 提取
