## Why

当前纸鸢 Agent 有探索/执行两个 Tab，但：
1. 探索模式报 400 错误（API 不通）
2. 两个模式分裂用户体验——用户不知道该点哪个
3. Agent 本身应该能判断什么时候聊天、什么时候调工具

参考 Claude Code 的 WorkBuddy 模式：统一聊天界面 + 输入框上方的快捷操作卡片。用户自由输入，agent 智能应答，高频操作一键触发。

## What Changes

- **去掉 Tab 切换**：移除 explore/execute 双 Tab 和 URL 参数路由
- **统一 System Prompt**：Agent 同时具备聊天引导和工具调用能力，自己判断场景
- **快捷操作卡片**：输入框上方放一排建议卡片（查投递、评估JD、推荐岗位等），点击自动填充提示语
- **代码精简**：删除 `switchTab`、`tabParam`、`EXPLORE_WELCOME`/`EXECUTE_WELCOME` 分支逻辑

## Capabilities

### New Capabilities
- `unified-chat`: 统一聊天界面，单输入框 + 建议卡片
- `suggestion-chips`: 快捷操作卡片组件，可配置，点击即用

### Modified Capabilities
- `agent-conversational`: 去掉双模式，统一为一个 Agent
- `agent-phase-visualization`: 不变，统一聊天中依然显示 thinking/executing/responding 阶段

## Impact

- **修改**: `src/app/agent/page.tsx` → 删 Tab 逻辑，加 suggestion chips，统一 System Prompt
- **修改**: `src/components/agent/AgentChat.tsx` → 新增 `suggestions` prop，在输入框上方渲染卡片
- **新增**: `src/components/agent/SuggestionChips.tsx` → 快捷操作卡片组件
- **修改**: `src/app/api/agent/chat/route.ts` → System Prompt 不再区分 mode
- **删除**: URL 参数 `?tab=` 相关逻辑、ProfilePanel 侧边栏（可选保留）
