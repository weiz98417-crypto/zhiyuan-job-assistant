## Why

筝筝纸鸢有两个独立前端（Go TUI 仪表盘 + Next.js Web）和一个基于 Claude 的 Agent 系统。Agent 读写 Markdown/TSV 文件，前端读写 SQLite。DATA_CONTRACT.md 声明 SQLite 是"规范存储"，但 CLAUDE.md 仍指示 Agent 走已弃用的 `batch/tracker-additions/` → `merge-tracker.mjs` 路径。数据可能在弃用的桥接层丢失，前端看不到 Agent 的最新写入。同时，LLM 生成的评分/日期/状态未经校验直接写入文件，CV 和 profile 是占位符数据导致评估无意义，8 个规范状态在 4 个位置重复定义。

## What Changes

- **BREAKING**: 废弃 `batch/tracker-additions/` 路径和 `merge-tracker.mjs`。Agent 直接写入 SQLite（通过 Next.js API `/api/data/*` 或 SQLite 直写）
- 添加 LLM 输出校验层：分数范围 1.0-5.0、日期 YYYY-MM-DD、报告路径格式、状态规范值
- `templates/states.yml` 作为状态枚举的唯一权威源，所有消费者（`merge-tracker.mjs`、`CLAUDE.md`、Go TUI）从它读取
- `cv.md` 和 `config/profile.yml` 的空占位符设为硬阻断——数据不完整时 Agent 拒绝执行评估
- 更新 `CLAUDE.md` 的数据写入指令，指向 SQLite 路径
- `modes/zh/_shared.md` 和 `modes/_shared.md` 的评分维度统一到共享定义文件

## Capabilities

### New Capabilities
- `data-write-path`: Agent 端统一数据写入路径——所有持久化走 SQLite，不再写入 Markdown/TSV
- `llm-output-validation`: LLM 生成的结构化数据（评分、日期、状态、路径）在持久化前校验格式和范围
- `state-enum-sync`: `templates/states.yml` 作为唯一状态定义源，所有消费者动态读取
- `cv-profile-gate`: cv.md 和 profile.yml 缺失或为占位符时，Agent 拒绝执行评估（硬阻断）

### Modified Capabilities
<!-- 无现有 spec 需要修改 -->

## Impact

- `CLAUDE.md`: 数据写入指令从 TSV 路径改为 SQLite 路径；入职检查中 CV/profile 改为硬阻断
- `merge-tracker.mjs`: 标记为只读遗留（不再被 Agent 调用）
- `modes/_shared.md` + `modes/zh/_shared.md`: 评分维度引用共享定义文件
- `modes/zh/jianzhi.md` + `modes/oferta.md`: 评估流程增加输出校验步骤
- `batch/tracker-additions/`: 不再写入新文件
- `frontend/src/lib/server-db.ts`: 确保 API 端点覆盖所有 Agent 写入场景
- `data/applications.md`: 降级为只读历史数据
