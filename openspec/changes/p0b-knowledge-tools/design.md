## Context

3 个 P0B 工具的服务端依赖各不相同：`check_pipeline_health` 读 SQLite 投递记录；`self_positioning` 和 `prepare_interview_full` 读 Markdown mode 文件。统一通过 `/api/agent/mode/[mode]` 端点加载 mode 文件内容，管道健康通过现有 analytics API 或直接从 IndexedDB 计算。

与 P0A 工具同模式：浏览器端 handler → `fetch()` API 端点 → 服务端执行。

## Goals / Non-Goals

**Goals:**
- Agent 能主动检测管道逾期并提醒用户
- Agent 能引导用户进行 4 阶段职业方向探索
- Agent 能基于 JD 和故事库生成定制化面试方案

**Non-Goals:**
- 不实现 dingwei.md 的全部交互逻辑（4 阶段框架作为上下文注入，具体对话由 LLM 驱动）
- 不实现管道自动跟进（仅检测和提醒）
- 不修改 interview-prep.md 或 story-bank.md 的内容

## Decisions

### D1: Mode 文件加载 → 统一 `/api/agent/mode/[mode]` 端点

所有需要读 `modes/zh/*.md` 的工具统一通过一个动态路由加载：
```
GET /api/agent/mode/dingwei → 返回 modes/zh/dingwei.md 的 Markdown 内容
GET /api/agent/mode/interview-prep → 返回 modes/zh/interview-prep.md
```

**Why:** 避免为每个 mode 文件建独立端点。后续新增 mode（如 `apply.md`）只需工具端新增调用，无需新建 API。

### D2: 管道健康 → 从 IndexedDB 计算

`check_pipeline_health` 的 handler 在浏览器端直接从 DexieDB 读 `applications` 表，计算逾期天数（`last_contact_date` 或 `date` 字段距今天数 > 7），无需新建 API 端点。

**Why:** 投递数据已在 IndexedDB 中（通过 `db-write.mjs` → SQLite → API → IndexedDB 同步），浏览器端直接查询最快。后续 `server-side-agent-loop` change 中可改为服务端直读 SQLite。

### D3: self_positioning → 注入 mode 框架 + LLM 驱动对话

`self_positioning` 不硬编码对话流程。工具加载 `dingwei.md` 内容，作为 `dingweiFramework` 文本返回给 LLM，LLM 在上下文中按 4 阶段引导用户。

**Why:** dingwei.md 已包含完整的阶段描述和引导话术模板。工具只做"搬运"，对话的灵活性和个性化由 LLM 负责。

## Risks / Trade-offs

- **[Risk] dingwei.md 内容过长（~2000 tokens）可能撑大上下文** → formatResult 时截取框架要点（阶段名称 + 每个阶段的引导问题），完整内容在 LLM 需要时通过 data 字段提供
- **[Trade-off] 管道健康目前只查浏览器端 IndexedDB** → 首次加载可能数据未同步。在工具描述中提示 LLM"如无数据可建议用户刷新"
