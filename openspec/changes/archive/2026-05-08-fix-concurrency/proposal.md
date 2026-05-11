## Why

Agent 系统有两处明确的并发冲突：(1) `modes/pipeline.md` 的"并行 agent"建议与 `modes/_shared.md` 的"禁止并行 Playwright"规则直接矛盾；(2) 报告编号采用"读最大值 +1"的非原子操作，并行 agent 会覆盖彼此的报告文件；(3) `scan.mjs` 并发度设为 10 但仅支持 3 个海外 ATS API，中国主流招聘平台（Boss直聘、拉勾、猎聘）无 API 覆盖。

## What Changes

- `modes/pipeline.md:14`: 删除"3+ URLs 时启动并行 agent"建议，改为明确串行顺序——先处理 API 可扫描的 URL，再逐个串行处理需要 Playwright 的 URL
- **新增** `scripts/next-report-num.mjs`: 使用文件系统原子操作分配报告编号（`mkdirSync` 在 `reports/.locks/` 下创建编号目录，失败则自增重试）
- `scan.mjs`: 添加中国招聘平台的 API 适配器或明确文档化覆盖范围。`portals.yml` 中标记需要 Playwright 回退的公司
- `modes/_shared.md:123` + `modes/zh/_shared.md:150`: 明确"禁止并行 Playwright"规则也覆盖 pipeline 模式

## Capabilities

### New Capabilities
- `atomic-report-numbering`: 原子化的报告编号分配，消除并行 agent 的文件覆盖风险
- `pipeline-serial-execution`: pipeline 模式强制串行执行顺序（API → Playwright），消除并行矛盾
- `scan-platform-coverage`: 扫描器平台覆盖声明和 Playwright 回退标记

### Modified Capabilities
<!-- 无 -->

## Impact

- `modes/pipeline.md`: 删除并行建议，添加串行顺序
- `modes/_shared.md` + `modes/zh/_shared.md`: 强化并行禁止规则
- `scripts/next-report-num.mjs`: 新文件
- `scan.mjs`: 平台适配器或覆盖文档
- `portals.yml`: 添加 Playwright 回退标记字段
