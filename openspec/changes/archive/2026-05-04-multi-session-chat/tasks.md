## 1. 数据模型与持久化

- [x] 1.1 在 `types/index.ts` 中定义 `ChatSession` 接口
- [x] 1.2 在 `lib/db.ts` 中升级 DexieDB 到 v6，新增 `chatSessions` 表（id, title, messages, memoryDigest, pinned, deletedAt, createdAt, updatedAt）
- [x] 1.3 创建 `lib/agent/sessions.ts`：实现 `createSession`、`listSessions`、`getSession`、`updateSession`、`deleteSession`、`pinSession`、`searchSessions`
- [x] 1.4 实现软删除逻辑：标记 `deletedAt`，5 秒后物理删除

## 2. 会话侧边栏 UI

- [x] 2.1 创建 `components/agent/SessionList.tsx`：会话列表组件（标题、消息数、时间戳、删除/置顶按钮）
- [x] 2.2 添加搜索输入框，实时过滤会话标题和消息内容
- [x] 2.3 桌面端：侧边栏始终可见（>=1280px, 宽度 ~280px）
- [x] 2.4 移动端：抽屉式滑入，通过按钮触发
- [x] 2.5 新建对话按钮（+）放在侧边栏顶部
- [x] 2.6 软删除 toast："已删除 · 撤回"，5 秒倒计时

## 3. 会话切换与隔离

- [x] 3.1 `page.tsx` 中增加 `currentSessionId` 状态和会话切换逻辑
- [x] 3.2 切换会话时保存当前会话消息到 DexieDB（`updateSession`）
- [x] 3.3 切换会话时加载新会话消息和 `memoryDigest`
- [x] 3.4 创建新会话时自动生成标题（首条消息前 20 字符）
- [x] 3.5 切换时 abort 当前 streaming（如有）
- [x] 3.6 首次使用自动创建 `default` 会话

## 4. AgentChat 调整

- [x] 4.1 移除 `AgentChat.tsx` 中的"重新开始"按钮（改为 page.tsx 控制）
- [x] 4.2 移除 `onReset` prop，新建对话由 page.tsx 的 header 按钮 + SessionList 的 + 按钮处理
- [x] 4.3 当 `currentSessionId` 变化时清空消息状态

## 5. 记忆隔离

- [x] 5.1 `page.tsx` 中发送消息时注入当前 session 的 `memoryDigest` 到 system prompt context
- [x] 5.2 会话消息数 >= 5 时自动生成 `memoryDigest`（提取关键用户偏好和决策）
- [x] 5.3 确保 agent loop 上下文只使用当前 session 的消息

## 6. 验证

- [x] 6.1 `npx tsc --noEmit` — 0 errors
- [x] 6.2 `npm run build` — 通过
- [ ] 6.3 手动测试：新建会话 → 发消息 → 标题自动生成 → 消息保留
- [ ] 6.4 手动测试：切换会话 → 消息隔离 → memoryDigest 隔离 → 上下文不混淆
- [ ] 6.5 手动测试：删除会话 → toast 出现 → 5 秒后永久删除
- [ ] 6.6 手动测试：搜索会话 → 过滤结果
- [ ] 6.7 手动测试：桌面端侧边栏常驻 / 移动端抽屉
