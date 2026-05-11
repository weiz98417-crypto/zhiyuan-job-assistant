## Context

当前面试准备页有三个 Tab：出题、教练、题库。教练 Tab 使用 `callDeepSeekJson`（非流式 JSON），单次请求返回结构化回答+追问列表，追问仅作为文本展示。出题 Tab 的 JD 选择器从 `db.applications` 加载数据，且 `jdText`/`cvText` 硬编码为空字符串，导致 LLM 从未看到实际内容。

现有基础设施：
- `createStructuredStream(config)` — 已在 evaluate/jd 中使用，支持 `<<SECTION>>...<</SECTION>>` 流式渲染
- `createDeepSeekStream(config)` — 原始文本流式输出
- `lib/stream-utils.ts` — DeepSeek API 封装
- `lib/jd-storage.ts` — JD 表 CRUD（getAllJDs, getJDById）
- `lib/cv-storage.ts` — localStorage CV 管理（getCVFullText, isCVEmpty）
- `db.jds` — IndexedDB 表存储已录入的 JD（含 body 全文）

## Goals / Non-Goals

**Goals:**
- 修复出题 Tab JD 选择器：从 `db.jds` 加载，传递 JD 正文和简历全文给 API
- 教练 Tab 改为多轮对话式 UI，支持 SSE 流式输出
- 追问问题可点击，点击后自动发送该问题作为下一条用户消息
- 用户可继续输入新内容进行多轮对话
- 对话历史在同一次会话内保留

**Non-Goals:**
- 对话历史持久化（刷新页面后丢失）
- 教练对话的多模式切换（在对话中切换 coachMode 会清空历史）
- 撤回/编辑已发送消息
- 语音输入

## Decisions

### 1. 教练对话数据模型

新增 `CoachMessage` 类型：

```ts
type CoachMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
```

对话状态管理：
- `coachMessages: CoachMessage[]` — 完整消息列表（含首次 system prompt）
- `coachInput: string` — 当前输入框文本
- `coachLoading: boolean` — 流式加载中
- `streamingContent: string` — 当前正在流式输出的内容

历史最多保留 20 条消息，超出时裁剪最早的问答对。

### 2. 新 API: POST /api/interview/coach/stream

SSE 端点，接受多轮消息历史：

```ts
Request: {
  messages: { role: string; content: string }[];
  mode: CoachMode;
}
```

首次调用时前端组装 system message + user message。后续调用前端追加新消息到历史数组。

SSE 事件类型：
- `section`: 带 `sectionKey` `sectionLabel` `content` 的增量流式章节
- `followUps`: 流结束时发送完整追问列表
- `done`: 流结束标记
- `error`: 错误信息

**为什么用新端点而不用现有 `/api/interview/coach`**：
- 现有端点是非流式 JSON，用于降级兼容
- 新端点流式 SSE，语义完全不同
- 保留旧端点避免破坏已有评分功能

### 3. 流式方案选择

使用 `createStructuredStream`（与 evaluate/jd 相同），因为教练输出也是多段结构（背景→角色→行动→结果→反思）。

Alternatives considered:
- `createDeepSeekStream`（纯文本流式）→ 不够结构化，前端无法区分章节
- 保持 `callDeepSeekJson`（非流式）→ 不符合改进目标
- **选择 `createStructuredStream`**：已有成熟实现，前端有现成的分段渲染参考

### 4. 追问交互设计

追问列表在流式完成后渲染为可点击按钮。点击追问 → 将追问文本作为 user message 追加到 messages，自动触发下一次流式请求。

同时保留手动输入区域，用户可以输入自定义内容继续对话。

### 5. JD/CV 数据源修复

出题 Tab 的 JD 选择器改为：
- 从 `db.jds` 加载 JD 列表（替代 `db.applications`）
- 选中 JD 后读取 `jd.body` 作为 `jdText`
- 调用 `getCVFullText()` 读取简历全文作为 `cvText`
- 显示 CV 状态标签：已加载（绿色）/ 为空（灰色提示）

## Risks / Trade-offs

- **长对话 token 消耗** → 限制最多 20 条消息（约 10 轮），超出裁旧；system prompt 精简
- **追问可能重复** → 前端做简单去重（与前一条 user message 内容相同则阻止发送）
- **模式切换时历史不兼容** → 切换 coachMode 时清空对话历史并提示用户
- **CV 可能为空** → 添加 CV 状态指示器，为空时仅传"无简历数据"，出题仍可基于 JD 通用出题

## Migration Plan

1. 新增 API 端点，不修改现有端点
2. 前端 interview/page.tsx 教练 Tab 改造为新对话 UI
3. 出题 Tab JD 选择器修复
4. 旧 `/api/interview/coach` 保留，评分功能继续使用
5. 无需数据库迁移
