## Why

当前纸鸢分散在三个入口——`/explore`（需求探索聊天）、仪表盘智能推荐卡片、Agent Memory 后台——三者不对话。用户在探索页聊完求职方向，到仪表盘看到的推荐不知道那些对话发生过。`agent-unified-memory` 阶段建好了 Memory / Tools / Knowledge / Context Assembler 全套基础设施，但缺少一个让用户真正跟纸鸢对话的统一界面。现在是时候把这套设施用起来了。

## What Changes

- **新增 `/agent` 对话页**：纸鸢的统一入口，内含探索/执行两个 Tab
- **迁移 `/explore` 功能到 Agent 探索 Tab**：聊天、总结、画像生成链路照旧，底层从 localStorage 迁入 DexieDB Memory
- **新增执行 Tab**：纸鸢调用 Tools（查投递、评估JD、健康检查、推荐），注入 Knowledge，全程记 Memory
- **拆除独立的 `/api/chat/stream` 路由和独立的纸鸢 System Prompt**：统一走 context assembler
- `AppShell` 侧边栏 "需求探索" 入口改为 "/agent"
- **BREAKING**: `/explore` 页面 301 redirect 到 `/agent?tab=explore`；`lingji-explore-chat` localStorage key 逐步废弃

## Capabilities

### New Capabilities
- `agent-conversation-page`: Agent 对话页 — 探索/执行双 Tab，统一聊天流，共享 Memory
- `agent-execute-mode`: 执行模式 — 工具调用、结果渲染、按需行动

### Modified Capabilities
- `explore-chat-ui`: 聊天组件复用为 Agent 通用聊天组件，消息模型升级支持 tool_call 消息
- `frontend-shell`: 侧边栏 "需求探索" → "Agent"，/explore redirect

## Impact

- **新增**: `src/app/agent/page.tsx`（Agent 对话页）
- **新增**: `src/app/api/agent/chat/route.ts`（统一聊天 stream，替换 `/api/chat/stream`）
- **新增**: `src/components/agent/AgentChat.tsx`（通用聊天组件，支持 tool 消息渲染）
- **修改**: `src/app/explore/page.tsx` → redirect to `/agent?tab=explore`
- **修改**: `src/components/shell/AppShell.tsx` → 侧边栏链接更新
- **修改**: `src/app/page.tsx` → "去探索页"链接更新
- **删除**: `src/app/api/chat/stream/route.ts` 中的独立 System Prompt（复用 context assembler）
