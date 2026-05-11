## Context

当工具执行失败时（API 超时、参数不足、数据为空），当前 Agent Loop 的反馈链路是断裂的：
- LLM 只看到 `失败: xxx` 字符串，不知道这是"可以换参数重试"还是"根本不可能成功"
- 用户看到"卡住了"——前端没有区分离线/超时/永久失败
- `ToolResult` 只有 `success: boolean`，缺少恢复策略元信息

`client-runner.ts` 刚刚完成了错误自愈的基础设施（`tool_error` 事件 + `qualityHint` 注入），但缺少工具侧的配合——工具 handler 没有声明失败是可恢复还是永久。

## Goals / Non-Goals

**Goals:**
- 扩展 `ToolResult` 类型，增加 `recoverable` 和 `retryHint` 字段
- 为关键工具（decode-terms, optimize-resume-section, scan-risks, evaluate-jd-full 等）补充恢复标记
- Loop 根据 `recoverable` 决定是否给 LLM 重试提示，还是直接告知用户不可恢复

**Non-Goals:**
- 不改变工具 handler 的函数签名（向后兼容，新字段可选）
- 不引入重试队列或外部重试服务
- 不处理 DeepSeek API 本身的超时重试（已在 `callLLM` 的模型链降级中处理）

## Decisions

### Decision 1: `ToolResult` 扩展为可选字段

```ts
interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  recoverable?: boolean;   // 默认 true（向后兼容）
  retryHint?: string;       // 给 LLM 的重试建议
}
```

**为什么是可选的？** 18 个已有工具 handler 不必全部改动。未设置时 Loop 按默认行为处理：`recoverable` 默认 `true`（允许重试），`retryHint` 默认使用通用文案。

**替代方案考虑：** 用错误码枚举（`ErrorCode.Timeout`, `ErrorCode.EmptyData` 等）——更结构化但需要所有工具同步迁移，改动面太大。选可选字段方案是为了增量落地。

### Decision 2: 可恢复 vs 永久失败的分界规则

| 失败场景 | recoverable | retryHint 示例 |
|----------|-------------|----------------|
| API 超时 / 500 | true | "API 超时，请减少搜索范围或换关键词重试" |
| 数据为空（CV 板块 <20 字） | false | "简历板块内容不足，无法优化——请先在 CV 页面完善内容" |
| 参数不足（JD 文本 <20 字符） | false | "JD 文本太短，请提供完整的职位描述" |
| 网络错误 | true | "网络请求失败，请稍后重试" |
| 权限错误（403） | false | "无权限访问该资源" |

### Decision 3: Loop 层消费 recoverable

**client-runner.ts + server-runner.ts 的统一处理逻辑：**

```
toolResult.success === false
  ├─ recoverable === false → 不累加 autoRetryCount，不注入 qualityHint
  │   直接告诉用户失败原因，不浪费迭代尝试重试
  └─ recoverable === true  → 累加 autoRetryCount，注入 retryHint
      超过 MAX_AUTO_RETRY 后强制 LLM 基于已有知识回答
```

## Risks / Trade-offs

- **[风险] 工具 handler 忘记设置 recoverable → 默认 true 可能导致永久失败也被重试**
  缓解：关键工具（evaluate-jd-full, optimize-resume-section, analyze-jd-risks, decode-terms）必须在本次 change 中设置。其余工具增量改进。

- **[风险] retryHint 文本质量参差不齐 → LLM 收到无用的重试建议**
  缓解：Loop 层有 fallback 通用文案。对非关键工具不强制设置 retryHint。

- **[取舍] 类型扩展比错误码枚举更松散，但迁移成本低得多**
  选择宽松方案是为了在 2 小时内完成核心工具的标记，而不是花 2 天重构所有工具的错误处理。

## Migration Plan

1. 修改 `types.ts` — `ToolResult` 加 `recoverable?: boolean` 和 `retryHint?: string`
2. 修改 `client-runner.ts` / `server-runner.ts` — qualityHint 逻辑分支读取 `recoverable`
3. 标记 4 个关键工具的 error 返回（每处改动约 2 行）
4. 手动验证：模拟空 CV 优化、超短 JD → 观察 agent 行为是否区分永久/可恢复

向后兼容：所有未设置 `recoverable` 的现有工具 handler 正常运行，Loop 默认按可恢复处理。

## Open Questions

- 是否需要在前端 UI 区分"工具可恢复失败"和"永久失败"的视觉样式？目前 `tool_error` 事件已在 SSE 流中，前端消费待后续 change。
