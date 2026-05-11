## Why

工具执行失败时，`client-runner.ts` 只做 `continue`（跳过当前工具），LLM 不知道发生了什么，用户看到的是"卡住了"。需要让失败可视化 + LLM 自动重试 + 降级策略。

## What Changes

1. **`client-runner.ts`**：工具失败后 yield 错误信息到上下文，LLM 自动尝试替代方案（换参数、换工具、直接回答）
2. **`ToolResult` 类型扩展**：加 `recoverable` 标记（可重试的失败 vs 永久失败）
3. **各工具 handler 规范**：失败时返回包含"给 LLM 的恢复建议"的结构化错误

## Capabilities

- `error-self-healing`: 工具失败 → LLM 看到错误原因 → 自动换参数重试或降级到其他工具

## Impact

- **修改**: `client-runner.ts`（错误处理逻辑）
- **修改**: `loop/types.ts`（ToolResult 加 recoverable）
- **修改**: 关键工具 handler（decode-terms, optimize-resume-section 等加恢复建议）
