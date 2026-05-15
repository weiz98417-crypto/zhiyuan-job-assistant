## Why

当前工具调用失败时返回的错误信息不含纠正线索（如 `"不支持的文件类型: "`），LLM 不知道可用选项，只能反复猜参数或调其他工具，触发 degradeToUser → 循环继续 → 工具乱闪 → 对话框崩溃的正反馈链。主流做法（Claude Code）是在错误中嵌入可用资源信息，让 LLM 从错误中自我纠正。

## What Changes

- `read_file`、`get_report_detail` 等"需要精确参数"的工具，在永久错误分支中返回可用资源列表（如 `"可用: '我的简历', 参考简历: #1 张雯茜"`）
- `client-runner.ts` 的 `degradeToUser` 路径注入强制约束：`"禁止调用任何工具，直接输出文字回复"`
- `resolveErrorCategory` 保持 permanent fallback（已在 decouple-tool-result-pipeline 中修改）
- Agent 系统提示词中注入当前会话可用资源摘要（简历状态、参考简历列表、最近报告编号）

## Capabilities

### New Capabilities

- `tool-error-self-healing`: 工具永久错误返回自描述纠正信息，agent loop 在 degradeToUser 后禁止下一轮调用工具，阻止错误→循环→崩溃链

### Modified Capabilities

- `agent-loop-engine`: `degradeToUser` 路径新增工具调用禁止约束

## Impact

- `src/lib/agent/tools/query/read-file.ts` — 错误分支返回可用资源
- `src/lib/agent/tools/query/get-report-detail.ts` — 错误分支返回最近报告列表
- `src/lib/agent/tools/query/get-reference-detail.ts` — 错误分支返回参考简历列表
- `src/lib/agent/loop/client-runner.ts` — degradeToUser 注入禁止工具调用
- `src/lib/agent/loop/server-runner.ts` — 同步修改
- `src/lib/agent/registry/agents/resume-agent.ts` — 系统提示词注入可用资源
- `src/lib/agent/registry/agents/evaluate-agent.ts` — 系统提示词注入可用资源
