## 1. 修复换题消息残留

- [x] 1.1 `page.tsx` PracticePanel 的 AnimatePresence key 从 `"practice"` 改为 `activeQuestion.question`
- [x] 1.2 验证：练习题目A → 输入回答 → 返回 → 点题目B → 聊天区为空

## 2. 面试风格选择器上移

- [x] 2.1 `page.tsx` 配置区新增 coach mode 选择器（复用 `COACH_MODES` 的 shortLabel），布局与现有大厂预设一致
- [x] 2.2 配置区 mode 默认选中 `"project-review"`（大厂），切换时不影响已生成的题目
- [x] 2.3 `PracticePanel` 移除内置 mode 选择器（第 305-331 行），移除 `mode` 和 `onModeChange` props
- [x] 2.4 `page.tsx` 移除传给 PracticePanel 的 `mode={coachMode}` 和 `onModeChange={setCoachMode}` props

## 3. 修复追问发送格式

- [x] 3.1 `PracticePanel.handleFollowUpClick` 修改发送内容为 `"面试官追问：「${fuq}」\n\n请帮我准备这个追问的回答，并结合之前的对话上下文。"`
- [x] 3.2 防重复点击逻辑同步更新（检查 lastMsg.content 是否匹配新格式）

## 4. 验证

- [x] 4.1 TypeScript 编译零错误
- [x] 4.2 换题 → 练习 → 返回 → 换题 → 消息清空
- [x] 4.3 配置区选择风格 → 生成题目 → 练习 → AI 用正确 persona 反馈
- [x] 4.4 追问按钮发送后聊天区显示的是追问上下文格式而非原始问题文本
