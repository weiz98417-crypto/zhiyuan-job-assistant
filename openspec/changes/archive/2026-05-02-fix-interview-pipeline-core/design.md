## Context

当前 `interview-pipeline-unified` 的 SSE 流式解析存在 chunk 边界截断问题，JD/CV 数据仅在页面 mount 时加载，练习面板缺少首次引导，STAR 故事与 AI 出题系统无数据连接。本次修复在不改变整体 Pipeline 布局（配置→题目→练习→已练）的前提下，针对性地修复这四个缺陷。

基础设施：Next.js 16 Route Handlers（SSE streaming）、DeepSeek API（`deepseek-v4-flash`）、IndexedDB（Dexie.js）、localStorage（CV）。

## Goals / Non-Goals

**Goals:**
- SSE 解析在 DeepSeek 流式 chunk 边界下不丢内容
- JD 选择器和 CV 状态每次展开配置区时自动刷新
- 练习面板首次打开自动发送引导消息，触发 AI 教练输出
- 出题 API 可接收 stories 上下文，生成题目时参考已知经历
- 练习记录可一键转为 STAR 故事

**Non-Goals:**
- 不改 Pipeline 整体布局（四区结构保留）
- 不做 Phase 2 的模拟面试会话管理/计时/语音
- 不引入新的第三方依赖
- 不修改数据存储表结构
- 不做对话历史持久化（刷新后仍丢失）

## Decisions

### Decision 1: SSE 行缓冲解析

```typescript
// 当前 parseSSEStream 的问题：
const text = decoder.decode(value, { stream: true });
const lines = text.split("\n"); // ❌ 跨 chunk 的 data 行被截断

// 修复方案：保留上一个 chunk 的末行 fragment
let lineBuffer = "";
// ...
const text = decoder.decode(value, { stream: true });
lineBuffer += text;
const lines = lineBuffer.split("\n");
lineBuffer = lines.pop() || ""; // 保留不完整的末行拼接给下一个 chunk
```

**Why**: 这是标准 SSE 客户端实现模式（EventSource polyfill 均用此方案）。改动极小，只影响解析循环的前几行代码。

**Alternatives considered**: 引入 `eventsource-parser` npm 包 → 引入额外依赖不必要；

### Decision 2: 配置区响应式刷新

在 `interview/page.tsx` 中，将 JD/CV 的加载从 `useEffect([], [])` 改为在配置区展开时触发：

```typescript
// 不再 mount-only
useEffect(() => { loadConfig(); }, []);

// 改为展开时刷新
useEffect(() => {
  if (!configCollapsed) refreshConfig();
}, [configCollapsed]);
```

同时，`generateQuestions` 内部已有 `getCVFullText()` 调用（保证出题时拿最新 CV），但 JD 下拉列表的选项不会自动刷新 → 出题前加一次 `refreshJDs()` 调用。

**Why**: 最小改动——不改组件结构，只改 effect 依赖。用户感知到"数据是新的"即可。

### Decision 3: 自动引导消息

PracticePanel 挂载后（`question` 不为 null 且 messages 为空），自动发送一条 system 引导作为首轮 "user" 消息：

```typescript
useEffect(() => {
  if (question && messages.length === 0) {
    const bootstrapMsg = `我正在准备回答这道题："${question.question}"。请先帮我分析这道题的考察点，然后引导我逐步组织回答。`;
    runChat(bootstrapMsg, []);
  }
}, [question]);
```

**Why**: 设计文档 task 4.2 说了"练习面板首次加载时调用 coach/stream，传入 questionContext + 引导消息"，但当前代码没有实现这一步。用户需要先打字才能触发 AI，不符合"教练主动引导"的预期。自动发送让 AI 先输出分析，用户再回复，形成自然的对话开端。

### Decision 4: Stories 传入出题 API

`POST /api/interview/generate` 新增可选参数 `storiesContext`：

```typescript
storiesContext?: {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
}[];
```

前端在调用 `generateQuestions` 时，从 `db.stories` 读取所有故事，传入 API。System prompt 增加：

```
用户已有的 STAR 故事（参考这些经历出题，避免出用户完全没有相关经验方向的题）：
[故事列表]
```

**Why**: 让 AI 知道用户准备了哪些故事，生成的题目能更精准地命中用户有准备的方向，同时对于用户有经历但没写进简历的方向也能出题。

### Decision 5: 练习记录→故事转换

在 PracticeRecords 的展开详情中增加 `[转为 STAR 故事]` 按钮。点击后打开故事编辑器，预填：
- 标题：从题目自动生成（如"关于{题目关键词}的练习"）
- 内容：从 Q&A 对中提取关键段落填入 STAR 各字段的 placeholder

**Why**: 练习过程中产生的回答本身就有 STAR 结构的雏形（教练就是按 STAR 结构指导的）。一键转换减少重复录入。

## Risks / Trade-offs

- [Risk] 自动引导消息可能消耗不必要的 token（用户刚进练习面板还没准备好） → 引导消息短且温和，仅做考察点分析和结构提示，不展开完整回答
- [Risk] stories 传入出题 API 增加 prompt 长度 → 限制最多传 5 个故事，超出截取最近的
- [Risk] 配置区频繁刷新 JD 列表可能触发 IndexedDB 查询 → Dexie 已有内存缓存，开销可忽略
- [Risk] SSE 行缓冲修复后仍可能存在 `<<SECTION_>>` 标签跨 chunk 的问题 → `emitPendingSections` 已有去重逻辑（emittedSections Set），增量匹配即可
