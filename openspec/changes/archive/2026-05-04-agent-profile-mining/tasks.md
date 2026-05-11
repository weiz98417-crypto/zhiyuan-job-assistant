## 1. Skill 文件

- [x] 1.1 `modes/zh/dingwei.md` 已在 repo 中

## 2. Agent Chat 触发 Skill

- [x] 2.1 SuggestionChips 增加「自我定位」选项（prompt: "帮我做自我定位"）
- [x] 2.2 prompt.ts 嵌入 dingwei.md 核心原则（原则、节奏、工具箱、退出条件、反模式）
- [x] 2.3 Agent 按原则、工具箱、退出条件运作

## 3. 工具支持

- [x] 3.1 创建 `mine-profile.ts` 工具（action=start/answer/reset）
- [x] 3.2 创建 `profile-sop.ts` 状态管理（断点续接）
- [x] 3.3 注册工具到 agent tools index

## 4. 画像动态更新

- [x] 4.1 自我定位对话每阶段完成后调 `/api/profile/analyze`（force: true，后台静默）
- [x] 4.2 eval 完成路径中静默调 `/api/profile/analyze`
- [x] 4.3 `/profile` 页面 5s 轮询刷新，动态感知画像更新

## 5. /profile 降级

- [x] 5.1 移除手动分析按钮
- [x] 5.2 增加更新说明 + 引导去 Agent Chat

## 6. 验证

- [x] 6.1 点击「自我定位」→ Agent 按 Skill 引导
- [x] 6.2 评估 JD 后 → auto-analyze
- [x] 6.3 /profile 只展示
