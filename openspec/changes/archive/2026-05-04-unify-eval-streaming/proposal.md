## Why

当前项目有三条评估路径互不相通：CLI Agent（modes + Claude Code）、前端 `/evaluate` 页面（假 loading 动画 + 一次性 JSON）、Agent Chat（prompt.ts 不知道 modes 存在）。截图 OCR 识别（智谱 GLM-4V）与 A-G 评估流程完全割裂——先识别、确认、再手动点评估。用户看不到 AI 的思考过程。这违背了产品设计文档中"AI 藏起来但结果有故事"的理念。

## What Changes

核心思路：**Agent Chat 是唯一的评估交互界面**——所有评估（文本/URL/截图）都在对话中完成。`/evaluate` 页面退化为纯 JD/报告管理入口。

- Agent Chat 成为评估入口 — 用户在对话中粘贴 JD 文本/URL、或通过 `+` 按钮上传截图（最多 5 张），Agent 自动检测并调用 evaluate_jd 工具，工具内部走流式 A-G 评估，评估过程通过 ReAct 循环的工具调用、流式文本、进度卡片在对话中可见
- `/evaluate` 降级为管理页面 — 移除输入区、loading 动画、报告渲染。保留并增强 JD 库（`/evaluate/jds`）和报告库（`/evaluate/reports`），作为评估产物的管理中心
- 评估引擎流式化 — 新增 `POST /api/evaluate/stream` SSE 端点，按 jianzhi.md 的 A-G 板块逐步执行。Phase 0 支持文本/URL/截图三种输入。Block D 先搜索真实薪资数据再注入 LLM
- Agent prompt 注入 modes 知识 — `prompt.ts` 增加评估框架摘要，让 Agent 理解 A-G 板块、archetype、中国市场规则，能自然解读评估结果
- 数据层统一 — 文件系统为真数据源，API 完成后自动写 reports/*.md 和 applications.md
- CLI modes 保留不变 — 继续作为评估知识源

## Capabilities

### New Capabilities

- `eval-streaming`: SSE 流式评估端点，Phase 0 支持文本/URL/截图，按 A-G 分块流式执行，Block D 搜索增强，自动文件落地
- `eval-ocr-input`: 截图多模态识别作为评估的 Phase 0，最多 5 张，智谱 GLM-4V 串行识别，进度可见

### Modified Capabilities

- `zh-evaluation-engine`: 评估执行方式从"单次 JSON"改为"分块流式"，不改变评估逻辑和输出格式
- `explore-chat-ui`: Agent Chat 成为评估交互界面，注入 modes 知识，evaluate_jd 工具走流式 API，对话中展示评估进度，输入框增加 `+` 按钮支持截图
- `jd-evaluation-ui`: `/evaluate` 页面从"评估交互界面"退化为"JD 管理 + 报告库"的纯管理页面，移除输入区和评估渲染
- `jd-smart-evaluate`: 自动评估触发逻辑从 `/evaluate` 页面迁移到 Agent Chat 的 prompt 判断
- `ocr-api`: OCR 端点从独立 API 变为流式评估引擎 Phase 0 的子模块

## Impact

- 新增：`frontend/src/app/api/evaluate/stream/route.ts`（SSE 流端点）、`frontend/src/lib/use-evaluation-stream.ts`（共享 hook，Agent Chat 用）
- 改造：`frontend/src/app/agent/page.tsx`（+ 按钮、评估卡片）、`frontend/src/lib/agent/prompt.ts`（modes 知识注入）、`frontend/src/lib/agent/tools/action/evaluate-jd.ts`（流式 API + 截图参数）
- 简化：`frontend/src/app/evaluate/page.tsx`（移除输入/评估，改为管理概览）
- 不修改：`modes/zh/*.md`、CLI 脚本（`.mjs`）、Go Dashboard、`/evaluate/jds`、`/evaluate/reports`（保留增强）
- 依赖：`DEEPSEEK_API_KEY`、`ZHIPU_API_KEY`、Exa API
