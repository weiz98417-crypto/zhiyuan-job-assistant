## 1. AgentChat.tsx — 状态条升级

- [x] 1.1 `ExecutingIndicator` 改为 `AgentStatusBar`——加 `startTime` prop，每秒刷新显示运行时长
- [x] 1.2 状态条格式：`🧠 识别中  ⏱ 3s` / `🔧 执行中 · ✨ 简历优化  ⏱ 8s`
- [x] 1.3 `renderStreamContent` 加规则：工具执行时已有文字继续显示，状态条在下方

## 2. page.tsx — 计时状态

- [x] 2.1 加 `startTime` state，首个 SSE 事件到达时设置
- [x] 2.2 传给 AgentChat 的 `startTime` prop

## 3. 数据流优化

- [x] 3.1 `optimize_resume_section` handler 读 localStorage 后自动 sync 到 SQLite（PUT /api/cv/data）
- [x] 3.2 `save_resume_section` 确认 SQLite 写入成功后才返回成功，失败时返回 recoverable error

## 4. 验证

- [ ] 4.1 发送"优化工作经历"→ 状态条显示 `🧠 识别中 ⏱ 0s → 🔧 执行中 ⏱ 5s → ✏️ 输出中`
- [ ] 4.2 工具执行期间已有流式文字不消失
- [ ] 4.3 CV 数据写入 SQLite 确认
