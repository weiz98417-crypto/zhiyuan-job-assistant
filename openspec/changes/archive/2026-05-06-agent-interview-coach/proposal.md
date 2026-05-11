## Why

当前面试准备页面（`/interview`）是完全独立的手动 UI，与 Agent Chat（`/agent`）零交互。面试练习的对话不写入 Agent Memory，Agent 不知道用户练过什么题、弱项在哪、有哪些 STAR 故事。同时，Agent Chat 已有的会话管理、流式对话、工具调用、信号提取等基础设施在面试环节完全被浪费。

VISION V1.5 规划了面试 AI 教练 V1（六种模式 + 动态出题 + 回答评分），但原方案是在 `/interview` 页面上继续堆手动 UI。这会导致未来 V2.5 多 Agent 架构时面试能力需要完整重写第三遍。

**正确做法：用 Agent Chat 承载面试教练，复用以太坊基础设施，为多 Agent 架构铺路。**

## What Changes

### 面试教练作为 Agent 模式

在 Agent Chat 内增加「面试教练」模式：
- 用户可通过 suggestion chip 或自然语言触发面试教练模式
- Agent 加载专用的 Interview Coach System Prompt（六种面试模式 + JD/CV 上下文）
- 复用现有 `agentLoopClient` 的 tool loop，新增 2 个面试专用工具
- 教练对话自动写入 Agent Memory（会话 + 信号提取）

### 新增面试专用工具

- `generate_interview_questions`：基于 JD + CV + 公司风格 动态出题
- `score_interview_answer`：四维度评分 + 逐段反馈 + 改进建议

### Agent Memory 打通

- 教练对话历史存入 Agent 会话
- 练习记录自动提取为 profile signals
- Agent 在非教练模式下也能引用面试练习中的发现

## Capabilities

### New
- `agent-interview-coach-mode`：Agent Chat 中增加面试教练模式，专用 system prompt 覆盖六种面试场景
- `agent-interview-tools`：面试出题和评分工具，通过 Agent tool loop 调用
- `agent-coach-memory`：教练对话写入 Agent Memory，练习信号接入画像系统

## Impact

- **新增文件**: `frontend/src/lib/agent/interview-coach-prompt.ts`（教练 system prompt），`frontend/src/lib/agent/tools/interview-tools.ts`（面试工具定义）
- **修改文件**: `frontend/src/app/agent/page.tsx`（增加教练模式入口），`frontend/src/components/agent/AgentChat.tsx`（教练模式提示），`frontend/src/components/agent/SuggestionChips.tsx`（新增教练 suggestion）
- **API 影响**: 新增 `POST /api/agent/coach/generate-questions` + `POST /api/agent/coach/score-answer`（或在现有 tool handler 中注册）
- **/interview 页面**: 不删，Phase 2 重构为仪表盘
