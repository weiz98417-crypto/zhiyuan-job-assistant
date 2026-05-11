## Why

面试准备页存在三个关键问题：(1) JD 选择器和出题功能的数据源错误，加载了 `applications` 表而非 `jds` 表，且 `jdText`/`cvText` 硬编码为空字符串，导致 LLM 从未看到实际 JD 和简历内容；(2) 回答教练仅支持单次交互，追问列表只展示不互动，无法进行多轮对话；(3) 教练 API 使用非流式 JSON 模式，用户体验差。这三个问题使面试准备功能形同虚设。

## What Changes

- 修复出题 Tab JD 选择器数据源：从 `db.applications` 改为 `db.jds`，加载 JD 正文并传递给 API
- 新增简历自动加载：从 `getCVFullText()` 读取简历全文，带状态指示器
- 将教练从单次请求改为多轮流式对话，支持聊天历史
- 新增 `POST /api/interview/coach/stream` SSE 端点，替代现有的非流式 JSON 端点
- 追问问题改为可点击按钮，点击后插入对话作为下一条用户消息
- 用户可随时输入新内容继续对话
- 教练对话历史在当前会话内保留，支持上下文连贯的多轮对话

## Capabilities

### New Capabilities

- `interview-coach-chat`: 多轮流式教练对话，支持追问点击和自定义输入，SSE 流式输出

### Modified Capabilities

- `interview-prep-ui`: 出题 Tab JD 选择器改为从 `db.jds` 加载，新增 CV 自动读取和状态指示；教练 Tab 从单次请求改为多轮对话 UI

## Impact

- **前端**: `interview/page.tsx` — JD 选择器、CV 加载、教练对话组件、追问交互
- **API**: 新增 `POST /api/interview/coach/stream`（SSE 流式），现有 `/api/interview/coach` 保留向后兼容
- **类型**: 新增 `CoachMessage` 类型（role/content 消息对）
- **依赖**: `lib/stream-utils.ts`（已有 `createStructuredStream`）, `lib/cv-storage.ts`（已有 `getCVFullText`）, `lib/jd-storage.ts`（已有 `getAllJDs`）
