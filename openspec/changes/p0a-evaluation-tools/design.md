## Context

已有资产 `scripts/scan-risks.mjs`（风险正则扫描）、`risk-intel-triggers.yml`（31 条触发词）、`modes/zh/risk-intel.md`（30 条黑话 + 10 种骗术 + 薪资基准）、`/api/evaluate`（A-G 7 维评分）、`scripts/db-write.mjs`（SQLite 写入）——这些都是服务端 Node.js 可用的。Next.js Agent 的工具 handler 运行在浏览器端（`fetch()` 调用），需要新建 API 桥接层让浏览器端工具能触发服务端资产。

工具注册遵循现有 `ToolDefinition` 接口（`tools/types.ts:15-22`），与现有 20 个工具同模式。

## Goals / Non-Goals

**Goals:**
- Agent 能通过 `evaluate_jd_full` 一键执行"风险扫描→评分→校验→入库→报告"全流程
- Agent 能通过 `analyze_jd_risks` 快速回答"这个 JD 有没有坑"
- Agent 能通过 `decode_black_market_terms` 解释 JD 中的黑话
- 3 个工具与 native function calling 协议兼容

**Non-Goals:**
- 不改动 `scan-risks.mjs` 或 `risk-intel.md` 的数据格式
- 不新增 AI SDK 依赖
- 不处理风险情报库的写入（误报反馈等，这在后续 change 中）

## Decisions

### D1: 工具粒度 → 3 个独立工具而非 1 个大工具

`evaluate_jd_full` 做完整评估（重操作，~10-30 秒），`analyze_jd_risks` 做快速扫描（轻操作，~1 秒），`decode_black_market_terms` 做点查询（极轻，~50ms）。

**Why:** LLM 通过 native function calling 选择工具。如果只有一个"万能"工具，LLM 每次都会调用它（因为描述覆盖了所有场景），给简单问题带来不必要的延迟。3 个工具让 LLM 根据用户意图选择合适的粒度。

### D2: 服务端资产调用 → 新建 API 桥接而非浏览器端重实现

`scan-risks.mjs` 运行在 Node.js，读文件系统（`risk-intel-triggers.yml`）。`risk-intel.md` 需要 YAML 解析。这些在浏览器端不可用。每个需要服务端资源的工具，handler 通过 `fetch()` 调一个专用 API 端点：

```
Agent (browser) → tool handler → fetch("/api/agent/scan-risks") → server: spawn("node", ["scan-risks.mjs"])
```

**Why:** 保持现有工具执行模式（浏览器端 `fetch()`）。服务端化在 `server-side-agent-loop` change 中统一处理，届时这些 `fetch()` 调用可改为直接函数调用。

**Alternative considered:** 在浏览器端加载 YAML 并做正则匹配 → 拒绝，因为 `risk-intel.md` YAML 格式需要 `js-yaml`，且浏览器端正则 `new RegExp()` 会丢失服务端的 `dotAll` 等标志。

### D3: evaluate_jd_full → 编排现有端点而非重写评估逻辑

`evaluate_jd_full` 的 handler 按顺序调用已有端点：
1. `/api/agent/scan-risks`（如果是 URL 先调 `/api/agent/fetch-jd` 抓取内容）
2. `/api/evaluate`（已有 A-G 7 维评分）
3. `/api/data/validation`（已有输出校验）
4. `/api/data/application`（已有 SQLite 写入）

**Why:** 不重复造轮子。每个端点已有成熟的错误处理和超时逻辑。工具 handler 只做编排和错误传播。

### D4: 风险输出格式 → 复用 scan-risks.mjs 的 JSON 输出

`scan-risks.mjs` 输出 `[{ signal, excerpt, severity }]`。工具 API 端点直接透传这个 JSON 结构，不做二次转换。

**Why:** 保持与 CLI agent 一致的输出格式，后续 `server-side-agent-loop` change 可以直接复用同一端点。

## Risks / Trade-offs

- **[Risk] evaluate_jd_full 总延迟可能达到 30 秒**（串行 4 个步骤）→ 工具 handler 返回中间状态文本给 LLM，LLM 可以流式更新用户。后续 `server-side-agent-loop` 可以加进度事件。
- **[Risk] scan-risks.mjs spawn 开销** → 每次调用启动新 Node 进程。当前调用频率低（每次 JD 评估 1 次），可接受。后续可改为常驻 worker。
- **[Trade-off] 浏览器端执行** → 工具仍在浏览器端（`fetch()` 代理模式），关掉标签页后工具执行中断。这是 `server-side-agent-loop` 的动机。
