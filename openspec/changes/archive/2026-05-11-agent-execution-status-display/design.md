## Context

当前 `ExecutingIndicator` 只显示"调用工具搜索" + 工具名 badge，无运行时长、无 token 计数。Claude Code 的状态条格式：`Thinking… 2m 46s · ↓ 3.0k tokens · thought for 1s`。

## Goals

- 工具执行期间显示实时计时器（每秒刷新）
- 工具名称以中文显示
- 如果已有流式文字，工具执行时不隐藏文字

## Decisions

- 计时器用 `setInterval` 1 秒刷新 + `useState`，在 `page.tsx` 传 `executingStartTime`
- 不额外追踪 tokens（DeepSeek streaming API 不返回中间 token 数，只有最终 usage，追加成本 > 价值）
- 状态条格式：`🔄 [工具中文名] ⏱ [Xs]`
