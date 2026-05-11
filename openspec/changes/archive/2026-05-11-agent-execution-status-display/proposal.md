## Why

Agent 工具执行时用户看不到任何反馈——只看到一个静态的 "调用工具搜索" badge，等 5-15 秒。Claude Code 右下角有实时状态条（"Thinking… 2m 46s · ↓ 3.0k tokens · thought for 1s"），用户随时知道 Agent 在干嘛。我们的 ExecutingIndicator 缺少三个东西：运行时长、当前操作描述、token 消耗。

同时，数据流不合理——优化工具读 localStorage 为主存储，应该走服务端 API。

## What Changes

1. **`ExecutingIndicator` → AgentStatusBar**：实时显示运行时长（秒级更新）、当前工具名、token 消耗（如果有）
2. **`page.tsx`**：加 `startTime` 状态，传给 AgentChat 用于计时
3. **数据流**：`optimize_resume_section` 和 `save_resume_section` 完成后同步 CV 数据到 API（SQLite），localStorage 降级为纯缓存
4. **`renderStreamContent`**：工具执行中如果已有文字，继续显示文字而非只显示 spinner

## Capabilities

- `agent-status-bar`: 实时状态条——显示阶段 icon + 文字 + 运行时长 + 工具名
- `stream-text-during-tools`: 工具执行期间不隐藏已有文字，下方显示工具状态

## Impact

- **修改**: `AgentChat.tsx`（`ExecutingIndicator` → `AgentStatusBar` + 计时器）
- **修改**: `page.tsx`（加 `startTime` 状态）
- **修改**: `optimize-resume-section.ts`（数据流优化）
