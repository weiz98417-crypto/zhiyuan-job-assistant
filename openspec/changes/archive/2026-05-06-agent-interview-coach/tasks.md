## 1. 面试教练 Prompt 模块

- [x] 1.1 创建 `frontend/src/lib/agent/interview-coach-prompt.ts`，包含 `buildInterviewCoachOverlay(context)` 函数
  - 六种面试模式定义（精简版，每种模式 3-5 行描述 + 回答结构 + 追问策略）
  - 接收 `context: { jdText?, jdCompany?, jdRole?, cvText?, mode?, companyPreset? }`
  - 返回 coach overlay 字符串，拼接在 Agent System Prompt 后面
- [x] 1.2 六种模式的公司映射：bytedance→project-review, tencent→project-review, alibaba→project-review, 外企→behavioral, 国企→state-owned, 初创→founder

## 2. 面试工具模块

- [x] 2.1 创建 `frontend/src/lib/agent/tools/interview-tools.ts`
  - 定义 `INTERVIEW_TOOLS` 数组（2 个工具定义：generate_interview_questions, score_interview_answer）
  - 工具包含完整的 JSON Schema parameters
- [x] 2.2 创建 `POST /api/agent/coach/generate-questions/route.ts`
  - 接收 `{ jdText, cvText, company, role, mode, count }`
  - 调用 DeepSeek API 生成题目
  - 返回 `{ questions: InterviewQuestion[] }`
- [x] 2.3 创建 `POST /api/agent/coach/score-answer/route.ts`
  - 接收 `{ question, answer, mode, context }`
  - 调用 DeepSeek API 进行四维度评分
  - 返回 `AnswerScore` 结构（含 segmentFeedback）

## 3. Agent 页面集成

- [x] 3.1 在 `frontend/src/lib/agent/interview-coach-prompt.ts` 中增加教练意图检测函数 `detectCoachIntent(content: string): boolean`
- [x] 3.2 修改 `frontend/src/app/agent/page.tsx` 的 `sendMessage`
  - 检测教练 intent 后，在 System Prompt 中注入 coach overlay
  - 教练模式下注册额外的面试工具（注册到全局 tool registry）
  - 保持现有对话流不变
- [x] 3.3 教练模式下发送的 assistant 消息标记 `mode: "interview-coach"`（存入 session）

## 4. UI 更新

- [x] 4.1 修改 `frontend/src/components/agent/SuggestionChips.tsx`，新增面试相关 chips：
  - "模拟面试"（默认显示）
  - "准备大厂面试"（默认显示）
- [x] 4.2 修改 agent/page.tsx header，教练模式激活时：
  - Header 区域显示"面试教练"轻量标签
  - SuggestionChips 切换为教练模式专用 chips
- [x] 4.3 教练模式标签点击可退出教练模式，恢复通用模式

## 5. Memory 集成

- [x] 5.1 教练对话中的 user messages 走现有 `scanMessage()` → `profile_signals` 通路
- [x] 5.2 教练对话结束时（模式切换/会话切换），确保 `triggerProfileUpdate` 已触发
- [x] 5.3 会话标题自动生成：如果当前标题是默认值且触发了教练模式，标题改为"面试练习 — {company} {role}"

## 6. 验证

- [x] 6.1 通过 suggestion chip 触发教练模式，验证 Agent 回复包含教练引导语（需启动 dev server）
- [ ] 6.2 输入"帮我准备字节跳动的产品面试"，验证 Agent 调用了 `generate_interview_questions`（需启动 dev server）
- [ ] 6.3 在教练对话中输入回答，验证 Agent 调用了 `score_interview_answer` 并返回评分（需启动 dev server）
- [ ] 6.4 验证教练对话结束后，Session 中有完整的对话历史（需启动 dev server）
- [ ] 6.5 验证教练对话触发了信号提取和 profile 更新（需启动 dev server）
