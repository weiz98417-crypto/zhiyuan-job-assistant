## 1. SuggestionChips 组件

- [x] 1.1 新建 `src/components/agent/SuggestionChips.tsx` — 接收 suggestions 数组，渲染一排可点击卡片
- [x] 1.2 卡片包含 icon + label，hover 高亮，点击回调 onSelect(prompt)
- [x] 1.3 streaming 时所有卡片置灰不可点击

## 2. 统一欢迎消息 + System Prompt

- [x] 2.1 新建统一欢迎消息（合并 explore/execute 欢迎语的精华）
- [x] 2.2 新建 `skills/zhiyuan-agent.md` — 统一 Agent 技能文件
- [x] 2.3 `prompt.ts` 中 AGENT_CORE_PROMPT 加入聊天引导能力

## 3. AgentChat 适配

- [x] 3.1 AgentChatProps 新增 `suggestions` prop
- [x] 3.2 在输入框上方渲染 SuggestionChips（仅当无历史消息且非 streaming 时显示）
- [x] 3.3 去掉 AgentChat 中跟 mode 相关的条件渲染（总结按钮、placeholder、tool card）

## 4. page.tsx 精简

- [x] 4.1 移除 explore/execute Tab 切换 UI 和 switchTab 函数
- [x] 4.2 移除 URL 参数 `?tab=` 相关逻辑（useSearchParams, router.push）
- [x] 4.3 移除 EXPLORE_WELCOME / EXECUTE_WELCOME 常量，用统一 WELCOME
- [x] 4.4 移除 mode 相关的所有条件分支（activeTab, mode prop 等）
- [x] 4.5 AgentChat 的 mode prop 已移除
- [x] 4.6 ProfilePanel 侧边栏保留，不受 mode 控制

## 5. 清理

- [x] 5.1 删除不再使用的 import（useSearchParams, Compass, Zap 等）
- [x] 5.2 AgentMessage.mode 改为 optional，SSE 事件解析不受影响

## 6. 验证

- [x] 6.1 TypeScript 检查 — 0 errors
- [x] 6.2 `next build` 通过
- [ ] 6.3 手动测试：页面加载 → 无 Tab 切换 → 显示统一输入框 + 建议卡片
- [ ] 6.4 手动测试：点击卡片 → 输入框自动填充 → 手动发送 → agent 正常回复
- [ ] 6.5 手动测试：自由输入聊天 → agent 聊天引导
- [ ] 6.6 手动测试：输入"查投递" → agent 调工具 → PlanCard + 工具结果渲染正常
