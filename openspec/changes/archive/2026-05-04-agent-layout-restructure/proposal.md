## Why

当前 Agent 页面版式存在三个问题：

1. **右侧求职画像面板冗余**：420px 宽的面板占用大量空间，内容与独立的 `/profile` 页面重复
2. **会话侧边栏断点过高**：`xl` 断点（1280px）导致大量屏幕（1024-1279px）无法看到侧边栏
3. **三栏布局挤压聊天区**：SessionList (280px) + Chat + Profile (420px) 在 1366px 屏幕上聊天区仅剩 666px

## What Changes

- 移除 Agent 页面右侧求职画像面板（ProfilePanel 组件及侧边栏抽屉）
- 会话侧边栏断点从 `xl` 降到 `lg`（1024px→260px）
- 页面标题栏简化为：移动端 hamburger + "纸鸢 Agent" + 新建对话按钮
- Profile 入口改为 header 上的小图标链接

## Impact

- `src/app/agent/page.tsx` — 移除 ProfilePanel、ProfileData 相关声明、handleSave 逻辑；调整布局结构
- `src/components/agent/SessionList.tsx` — 无改动
- `src/components/agent/AgentChat.tsx` — 无改动
