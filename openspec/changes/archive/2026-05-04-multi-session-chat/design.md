## Context

当前 `page.tsx` 用 React state 管理单会话的 messages 数组，"重新开始"按钮清空所有消息。AgentMessage 通过 `persistMessages()` 写入 DexieDB 的 `agentInteractions` 表，但只存最后一对 user+assistant，不是完整历史。DexieDB 已有 v5 schema（applications、reports、profiles、agentInteractions、agentDecisions、agentPreferences）。

约束：前端离线优先（DexieDB/IndexedDB）；不需要后端 API；UI 风格延续"纸鸢"的暖色调设计系统（`PaperCard`、`WarmButton`、`HandwritingTitle`）。

## Goals / Non-Goals

**Goals:**
- 多会话管理：新建、切换、删除、置顶、搜索会话
- 每会话独立消息存储和记忆上下文
- 自动标题生成（首条消息摘要）
- 软删除 + 撤回机制
- 会话列表侧边栏（桌面端始终可见，移动端抽屉）

**Non-Goals:**
- 不同会话间不共享消息历史（隔离）
- 不同会话间不共享 agent 偏好学习（后续迭代考虑跨会话学习）
- 不需要云端同步
- 不需要导出/导入会话（后续迭代）

## Decisions

### 1. 数据模型：单表扁平存储

**选择**: DexieDB v6 新增 `chatSessions` 表，messages 以 JSON 数组存储在 session 记录的 `messages` 字段中。

```typescript
interface ChatSession {
  id?: number;
  title: string;
  messages: AgentMessage[];
  memoryDigest?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**替代方案**: messages 单独建表，session 只存 metadata → 拒绝，因为单次会话的消息量不大（<100 条），DexieDB 处理 JSON 字段没问题，单表更简单。

### 2. 会话标题自动生成

**选择**: 创建会话时，用首条用户消息的前 20 个字符作为标题。如果用户消息包含 JD 链接或公司名，提取关键信息（如"分析JD: 字节前端"）。后续可以 edit 标题。

**替代方案**: LLM 生成标题 → 拒绝，浪费 token 且用户可能等不及。

### 3. 软删除策略

**选择**: 删除操作不立即物理删除，而是标记 `deletedAt`，5 秒后物理删除。期间显示 toast 含"撤回"按钮。物理删除时再执行 `db.chatSessions.delete(id)`。

**替代方案**: 移到回收站 → 拒绝，过于复杂。5 秒 toast 撤回覆盖 99% 的误操作场景。

### 4. 记忆隔离

**选择**: 切换会话时，将新会话的 `memoryDigest` 注入 system prompt（作为附加的 context 段落），覆盖旧会话的记忆上下文。各会话之间的 `memoryDigest` 独立存储。

**替代方案**: 全局 memory + session 过滤 → 拒绝，隔离不彻底。

### 5. 默认会话

首次使用自动创建 `default` 会话，包含 WELCOME 消息。用户第一次聊天时标题更新为首条消息摘要。

## Risks / Trade-offs

- **[R]** 大量会话导致 messages JSON 过大，拖慢 IndexedDB 读写 → **M**: 限制每会话最多 200 条消息，超出时提示用户开始新会话
- **[R]** DexieDB schema 升级可能冲突 → **M**: v6 为新增表，不修改现有表结构，向后兼容
- **[R]** 会话切换时 streaming 状态未清理 → **M**: 切换前 abort 当前 stream 并等待 done
