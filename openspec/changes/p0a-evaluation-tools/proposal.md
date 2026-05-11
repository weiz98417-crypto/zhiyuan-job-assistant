## Why

12 个 Claude Agent 模式（jianzhi.md、scan-risks.mjs、risk-intel.md 等）已是完整的评估和风险检测系统，但 Next.js Agent 没有工具可以调用它们。用户说"评估这个 JD"时 Agent 只能回复"建议你用评估功能"，而不是实际执行评估。P0A 注册 3 个工具，让 Agent 第一次能真正干活。

## What Changes

- 新建 `evaluate_jd_full` 工具：完整 JD 评估流程——风险扫描 → A-G 7 维评分 → 输出校验 → 写入 SQLite → 返回结构化报告
- 新建 `analyze_jd_risks` 工具：快速风险信号扫描，调用 `scan-risks.mjs` + `risk-intel-triggers.yml`
- 新建 `decode_black_market_terms` 工具：招聘黑话解码，匹配 `risk-intel.md` 中的 30 条黑话词典
- 新建 3 个支撑 API 端点：`/api/agent/scan-risks`、`/api/agent/decode-terms`、`/api/agent/fetch-jd`
- 修改 `tools/index.ts`：注册 3 个新工具到全局 ToolRegistry
- 依赖 `native-function-calling` change 已完成的 native tools API

## Capabilities

### New Capabilities

- `evaluate-jd-full`: 一键完整 JD 评估——接收 JD 文本或 URL，先跑风险扫描再跑 7 维评分，校验输出后写入 SQLite，返回结构化报告（公司、岗位、分数、风险表格、各维度评分）
- `analyze-jd-risks`: JD 风险快速扫描——接收 JD 文本片段，调 `scan-risks.mjs` 做正则匹配 + risk-intel-triggers.yml 触发词，返回风险信号表格（信号名、JD 原文摘录、严重度、加权总分）
- `decode-terms`: 招聘黑话解码——接收短语，调服务端 YAML 加载匹配 `risk-intel.md` 的 30 条黑话词典，返回 `{term, meaning, severity}` 列表

### Modified Capabilities

- `agent-tools`: 工具注册表新增 3 个工具条目（`evaluate_jd_full`、`analyze_jd_risks`、`decode_black_market_terms`）

## Impact

- **新建**: `frontend/src/lib/agent/tools/action/evaluate-jd-full.ts`
- **新建**: `frontend/src/lib/agent/tools/action/analyze-jd-risks.ts`
- **新建**: `frontend/src/lib/agent/tools/query/decode-terms.ts`
- **新建**: `frontend/src/app/api/agent/scan-risks/route.ts`
- **新建**: `frontend/src/app/api/agent/decode-terms/route.ts`
- **新建**: `frontend/src/app/api/agent/fetch-jd/route.ts`
- **修改**: `frontend/src/lib/agent/tools/index.ts`（import + register 三条）
- **依赖**: `native-function-calling`（change 1），工具通过 native function calling 被 LLM 调用
