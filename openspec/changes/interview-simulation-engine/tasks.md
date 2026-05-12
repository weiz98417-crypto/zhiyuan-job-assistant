## 1. 面试引擎

- [x] 1.1 新建 `frontend/src/lib/agent/interview/engine.ts`
- [x] 1.2 定义 `InterviewSession` 类型（id, company, role, phase, questions, answers）
- [x] 1.3 实现状态机：intro → tech → behavioral → reverse → summary

## 2. 会话 API

- [x] 2.1 新建 `frontend/src/app/api/agent/coach/session/route.ts`
- [x] 2.2 POST 创建面试：接收 company/role → 出第一题 → 返回 sessionId + question
- [x] 2.3 POST 继续面试：接收 answer → 评分 + 追问或下一题

## 3. 追问能力

- [x] 3.1 修改 `generate-questions` route：支持 `followup` 模式（基于上一轮回答动态出题）
- [x] 3.2 修改 `score-answer` route：评分输出包含具体改进建议

## 4. 集成

- [x] 4.1 修改 `prepare-interview-full` 工具：提供面试启动入口
- [x] 4.2 注册为 agent 工具

## 5. 验证

- [x] 5.1 `POST /api/agent/coach/session { company, role }` → 返回第一题
- [x] 5.2 完整面试流程：5 题 + 反问 + 总结
- [x] 5.3 追问触发：回答较简短时自动追问
