## Why

面试 Pipeline 页面（`interview-pipeline-unified`）虽然 TypeScript 编译通过且 20/21 个 task 标记完成，但实际运行中存在四个相互放大的缺陷：SSE 流式解析在 chunk 边界丢失内容导致 AI 教练无输出、JD/CV 数据只在 mount 时加载导致用户感知"改不了"、STAR 故事与 AI 系统完全脱节、练习面板首次打开无引导。用户的核心路径（配置→出题→练习→保存）在练习环节断裂，必须先修复基础才能推进 Phase 2 的全真模拟 Agent。

## What Changes

- 重写 coach/stream SSE 解析：用行缓冲替代 `split("\n")`，支持跨 chunk 断行拼接，确保 `<<SECTION_>>` 标签在流中正确提取
- JD 列表和 CV 状态改为响应式：从 page mount 改为每次展开配置区时重新读取，或在焦点恢复时刷新
- 练习面板首次加载时自动发送引导消息（"请开始回答这道题…"），触发 AI 教练首轮输出
- 出题 API 可选接收用户已有的 stories/practiceRecords 作为上下文，让 AI 生成题目时参考已知经历
- 题库统一视图增加"故事→练习"关联提示，练习记录可一键转为 STAR 故事

## Capabilities

### New Capabilities

- `sse-robust-parsing`: SSE 流式解析使用行缓冲 + 跨 chunk 拼接，正确处理 DeepSeek API 的流式 chunk 边界
- `interview-config-reactivity`: 配置区在每次展开时刷新 JD 列表和 CV 状态，替代 mount-only 读取
- `practice-auto-bootstrap`: 练习面板首次加载时自动发送引导消息触发 AI 教练首轮输出

### Modified Capabilities

- `interview-prep-ui`: 出题 API 新增可选 stories 上下文参数；题库统一视图增加练习记录与故事的关联操作

## Impact

- **前端**: `interview/PracticePanel.tsx`（SSE 解析重写 + 自动引导）、`interview/page.tsx`（配置区响应式刷新 + stories 传入出题 API）
- **API**: `/api/interview/coach/stream`（SSE 编码确保 chunk 完整性）、`/api/interview/generate`（新增可选 stories 参数）
- **类型**: 无需新增，PracticeRecord/StarStory/InterviewQuestion 均已有
- **存储**: 无需迁移，stories 和 practiceRecords 表共存
