## 1. 错误自愈核心

- [x] 1.1 `client-runner.ts` + `server-runner.ts`：工具执行 catch 后 yield `{ type: "tool_error", name, error, recoverable }` 到前端
- [x] 1.2 错误信息注入上下文：区分可恢复（注入 retryHint）和永久失败（引导用户操作）
- [x] 1.3 `ToolResult` 类型加 `recoverable?: boolean` 和 `retryHint?: string`

## 2. 工具 handler 规范

- [x] 2.1 关键工具（decode-terms, optimize-resume, scan-risks, evaluate-jd-full）返回 `recoverable: true` + `retryHint`
- [x] 2.2 永久失败场景（CV 内容不足、JD 文本太短、参数为空）返回 `recoverable: false`

## 3. 验证

- [ ] 3.1 模拟 DeepSeek 超时 → agent 自动重试或降级到其他模型 → 用户看到过程而非卡死
- [ ] 3.2 模拟 CV 数据为空 → optimize 工具返回"请先在 CV 页面创建简历"→ agent 引导用户
