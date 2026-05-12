## Context

现有 `generate-questions` 和 `score-answer` 两个独立 API，但没有会话状态——每次调用都是无状态的。面试模拟需要：记住当前在第几题、上题回答是什么、该追问还是下一题、整体评分汇总。

## Goals / Non-Goals

**Goals:**
- 混合模式：结构化框架（intro→tech×3→behavioral×2→reverse→summary）+ 每题内自由追问
- 会话状态持久化到 SQLite `interview_sessions` 表
- 追问触发条件：回答 < 50 字或 LLM 判断需要深入

**Non-Goals:**
- 不实现语音输入
- 不实现多人面试官角色
- 不接入视频/音频

## Decisions

### D1: 会话存储 → SQLite `interview_sessions` + `interview_answers`

```sql
interview_sessions(id, company, role, phase, question_index, questions_json, created_at)
interview_answers(id, session_id, question, answer, score, feedback, created_at)
```

### D2: 状态机 → `engine.ts` 纯函数

```typescript
function nextAction(session): "ask" | "followup" | "score" | "next" | "done"
```

不存 session 在内存——每次 API 调用从 SQLite 读 session，计算 next action，执行后写回。

### D3: 追问判断 → 字数 + LLM 双条件

回答 < 50 字 → 自动追问。≥ 50 字 → LLM 判断是否需要追问（prompt: "这个回答是否有可以深入挖掘的点？"）。

### D4: 工具注册 → `start_interview_session` 新工具

新增工具名 `start_interview_session`，agent 可调用它启动面试。

## Risks

- LLM 追问可能跑偏（问不相关问题）→ engine 在追问前注入当前题目的上下文约束
- 长对话 token 消耗大 → 每道题结束后清除旧的追问对话，只保留问题+回答+评分摘要
