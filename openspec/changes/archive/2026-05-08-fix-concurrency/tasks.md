## 1. 原子报告编号

- [x] 1.1 创建 `scripts/next-report-num.mjs` — mkdirSync 原子锁，清理超时锁，输出编号到 stdout
- [x] 1.2 测试并发场景 — 3个并发进程输出 1/2/3 三个唯一编号
- [x] 1.3 确保 `reports/.locks/` 添加到 `.gitignore`

## 2. Pipeline 串行化

- [x] 2.1 更新 `modes/pipeline.md:14` — 删除并行建议，替换为 API → Playwright 串行顺序
- [x] 2.2 更新 `modes/pipeline.md:9` — 报告编号改为 `node scripts/next-report-num.mjs`
- [x] 2.3 更新 `modes/_shared.md:123` — Playwright 禁止规则加"包括 pipeline 模式"（已在 unify-data-layer 中完成）
- [x] 2.4 更新 `modes/zh/_shared.md:150` — 同上中文版（已在 unify-data-layer 中完成）

## 3. 扫描平台覆盖

- [x] 3.1 更新 `portals.yml` — Anthropic + OpenAI 标记为 `scan_method: api`
- [x] 3.2 更新 `scan.mjs` — 读取 `scan_method` 字段，playwright 标记的公司跳过并输出 `SKIPPED`
- [x] 3.3 更新 `scan.mjs` 顶部注释 — ATS 覆盖范围、CONCURRENCY 说明、Playwright 串行声明
- [x] 3.4 测试 `scan.mjs` — 运行扫描，验证仅处理 api 标记的公司，playwright 标记的被跳过

## 4. 清理与验证

- [x] 4.1 清理 `reports/.locks/` 目录
- [x] 4.2 验证 pipeline 串行顺序已在 pipeline.md 中明确
- [x] 4.3 验证原子编号：3并发测试通过（1/2/3 无重复）
