# Tasks: c-transcript-single-writer

## 1. API 硬约束
- [ ] 1.1 sessions PATCH 服务端拒绝 messages 字段（422 + 指引）
- [ ] 1.2 允许字段限缩：title/pinned/agentState/interviewState 等

## 2. 客户端写入迁移
- [ ] 2.1 暂停/取消/恢复/归属提示改 UI 瞬态（Run 状态与事件渲染）
- [ ] 2.2 引导会话与优秀简历流程持久状态迁至 agentState 字段
- [ ] 2.3 删除 appendAssistantStatusMessage 及同类 transcript 写入

## 3. 逐条合并
- [ ] 3.1 条目稳定标识贯通：服务端投影与本地乐观层
- [ ] 3.2 刷新按条 reconcile（替代整表 setMessages）
- [ ] 3.3 周期性 messages 快照事件对账（与 B 共用）

## 4. 死器官切除
- [ ] 4.1 删对话项物化表 + Postgres 存储 + 迁移残留；按需投影端点保留为唯一读模型
- [ ] 4.2 ADR-0030（单写者 + items 删除，澄清 0020）

## 5. 门禁
- [ ] 5.1 双写竞争测试（迟到客户端更新不丢 worker 落库内容）
- [ ] 5.2 PATCH 422 测试；刷新合并结果断言
- [ ] 5.3 无生产引用确认（编译 + grep 门禁）
