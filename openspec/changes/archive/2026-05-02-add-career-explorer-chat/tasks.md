## 1. API 层 — 流式聊天端点

- [x] 1.1 创建 `/api/chat/stream/route.ts`，实现 DeepSeek SSE 流式代理
- [x] 1.2 构建 system prompt（访谈框架：经验→技能→偏好→约束→方向）
- [x] 1.3 处理边界情况：API Key 缺失、消息过长截断、流断开错误响应

## 2. API 层 — 归纳提取端点

- [x] 2.1 创建 `/api/chat/summarize/route.ts`，从对话历史提取结构化 JSON
- [x] 2.2 构建 system prompt（提取 targetRoles / skills / preferences / constraints / narrative / archetype）
- [x] 2.3 JSON 解析容错：markdown 代码块提取 + 解析失败降级

## 3. 聊天页面

- [x] 3.1 创建 `/explore/page.tsx`，页面骨架 + AppShell 导航注册
- [x] 3.2 实现聊天消息列表 UI（AI 消息 / 用户消息气泡，使用 PaperCard 风格）
- [x] 3.3 实现输入框 + 发送按钮（使用 WarmButton）
- [x] 3.4 实现流式消费逻辑（ReadableStream reader → 逐字追加到 AI 消息）
- [x] 3.5 实现"重新开始"按钮（清空消息 + localStorage）
- [x] 3.6 实现"帮我总结"按钮（loading 态 → 调 summarize API → 展示侧边栏）

## 4. 侧边栏画像面板

- [x] 4.1 实现侧边栏滑入/收起动画（framer-motion）
- [x] 4.2 实现画像信息卡片展示（推荐方向、技能清单、偏好、约束、叙事文案）
- [x] 4.3 实现"保存到档案"按钮（写入 profile.yml + _profile.md，状态反馈）

## 5. 持久化与边界

- [x] 5.1 实现聊天历史 localStorage 存取
- [x] 5.2 实现页面刷新后从 localStorage 恢复对话
- [x] 5.3 处理空状态（首次进入时的引导说明）
- [x] 5.4 TypeScript 类型检查通过
