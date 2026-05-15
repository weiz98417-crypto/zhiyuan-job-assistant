## 1. 类型层改造

- [x] 1.1 `src/lib/agent/tools/types.ts`：`ToolResult` 新增 `llmSummary?: string`、`uiPayload?: Record<string, unknown>`、`rawData?: unknown` 字段；`data` 标记 `@deprecated`
- [x] 1.2 `src/lib/agent/tools/types.ts`：`ToolDefinition` 新增 `buildLLMSummary?: (r: ToolResult) => string`、`buildUIPayload?: (r: ToolResult) => Record<string, unknown>`；`toolCtxCap` 默认值文档化
- [x] 1.3 `src/lib/agent/tools/types.ts`：`ToolResult` 的 `errorCategory` 改为必填类型（`ErrorCategory` 不含 undefined）

## 2. 执行层改造

- [x] 2.- [ ] 2.1 `src/lib/agent/loop/client-runner.ts`：`DEFAULT_TOOL_CTX_CAP` 600 → 800，`MAX_CONTEXT_TOKENS` 24000 → 64000
- [x] 2.- [ ] 2.2 `src/lib/agent/loop/client-runner.ts`：`capToolCtx` 改为 `getLLMContext(result, toolName)`，优先取 `result.llmSummary`，fallback 到 `formatResult(result)`
- [x] 2.- [ ] 2.3 `src/lib/agent/loop/client-runner.ts`：`resolveErrorCategory` fallback `transient` → `permanent`
- [x] 2.- [ ] 2.4 `src/lib/agent/loop/client-runner.ts`：并行路径（line 329-372）每个结果截断到 500 字符，并行完成后推汇总消息
- [x] 2.- [ ] 2.5 `src/lib/agent/loop/client-runner.ts`：SSE `tool_result` 事件新增 `uiPayload` 字段（取自 `toolResult.uiPayload`）
- [x] 2.- [ ] 2.6 `src/lib/agent/loop/client-runner.ts`：`pushWithBudget` / `ctx` 推送逻辑改为消费 `getLLMContext` 而非 `capToolCtx`
- [x] 2.- [ ] 2.7 `src/lib/agent/loop/server-runner.ts`：同步 2.1-2.6 的常数和逻辑修改（server-runner 忽略 uiPayload）

## 3. UI 层改造

- [x] 3.1 `src/components/agent/AgentChat.tsx`：`ToolResultCard` 改为默认折叠（工具名 + 前 100 字符预览 + 展开按钮）
- [x] 3.2 `src/components/agent/AgentChat.tsx`：`ProfileViewCard` 移除 `get_profile` 特殊判断，改为从 `msg.toolResult.uiPayload` 读取
- [x] 3.3 `src/app/agent/page.tsx`：`tool_result` SSE 处理 — 存储 `event.uiPayload` 到 `AgentMessage.toolResult`；移除 `showAsCard` 硬编码列表
- [x] 3.4 `src/app/agent/page.tsx`：`persist_done` 后的 Dexie 存储改用 `rawData` 字段（若存在）而非 `toolResult.result` 字符串

## 4. 工具迁移 — 第一批（问题工具）

- [x] 4.1 `src/lib/agent/tools/query/get-profile.ts`：handler 返回 `llmSummary` + `uiPayload: { type: "profile_view_card", cvSections, goals, refResumes }`
- [x] 4.2 `src/lib/agent/tools/query/read-file.ts`：handler 返回 `llmSummary` + `uiPayload: { type: "file_content", path, content, truncated }`
- [x] 4.3 `src/lib/agent/tools/query/get-reference-detail.ts`：handler 返回 `llmSummary` + `uiPayload: { type: "reference_resume", name, sections }`
- [x] 4.4 `src/lib/agent/tools/query/get-report-detail.ts`：handler 返回 `llmSummary` + `uiPayload: { type: "report_blocks", company, role, blocks, scores }`；errorCategory 区分不存在 vs 网络错误

## 5. 工具迁移 — 第二批（评估工具）

- [x] 5.1 evaluate-jd-full: formatResult fallback 覆盖（流式工具，llmSummary 不适用）
- [x] 5.2 evaluate-offer: formatResult fallback 覆盖（已含 errorCategory: "ok"）
- [x] 5.3 compare-offers-deep: formatResult fallback 覆盖（已含 errorCategory: "ok"）

## 6. 工具迁移 — 第三批（查询工具，8 个）

- [x] 6.1 search_applications 等 8 个查询工具: formatResult fallback 覆盖

## 7. 工具迁移 — 第四批（其余工具）

- [x] 7.1 余下 26 个工具: formatResult fallback 覆盖

## 8. 验证

- [x] 8.1 TypeScript 编译零新增错误（17 个既有错误不相关）
- [ ] 8.2 `get_profile` 调用后：LLM 上下文收到 ≤800 字符摘要，UI 展示折叠 ProfileViewCard
- [ ] 8.3 并行调用 3 个工具：上下文增长 ≤1500 字符（3×500），不再暴涨
- [ ] 8.4 `get_report_detail(不存在的报告编号)`：返回 `errorCategory: "permanent"`，LLM 告知用户"报告不存在"，不重试
- [ ] 8.5 `evaluate_jd_full` 流式评估：done 事件正常显示 EvalCompletionNotice，reportNum 注入 LLM 上下文
- [ ] 8.6 Resume agent："根据参考简历优化"路径走通一次，无循环无崩溃

## 9. 清理（Phase 5）

- [ ] 9.1 移除所有工具的 `formatResult` 函数（已被 `buildLLMSummary` 默认实现替代）
- [ ] 9.2 移除 `capToolCtx` 旧逻辑，统一为 `getLLMContext`
- [ ] 9.3 移除 `ToolResult.data` 的 `@deprecated` 引用和 fallback 代码
