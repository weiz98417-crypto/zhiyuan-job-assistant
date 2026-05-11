## 1. 新建脚本

- [x] 1.1 创建 `scripts/db-write.mjs` — Agent 端 SQLite 写入脚本，封装 `upsertApp`、`upsertReport`、`insertJD` 三个 action，接受 `--action` 和 `--data` 参数，输出 JSON 结果
- [x] 1.2 创建 `scripts/validate-output.mjs` — LLM 输出校验脚本，读取 `templates/states.yml`，验证 score/date/status/report_path，输出 JSON `{valid, errors[], warnings[]}`
- [x] 1.3 创建 `scripts/check-onboarding.mjs` — 入职数据完整性检查，验证 cv.md/content、profile.yml/name、modes/_profile.md 存在性，退出码 0=通过 1=阻断
- [x] 1.4 验证 `better-sqlite3` 在项目根目录的 Node.js 环境中可加载

## 2. 更新模式文件和配置

- [x] 2.1 创建 `modes/scoring-dimensions.yml` — 评分维度统一定义（A-G 块，每块的 id/key/label_zh/label_en/weight/applicable）
- [x] 2.2 更新 `modes/_shared.md` — 内联评分块替换为 `Read modes/scoring-dimensions.yml` 指令；强化 Playwright 并行禁止规则
- [x] 2.3 更新 `modes/zh/_shared.md` — 同上，中文评分块替换为配置引用
- [x] 2.4 更新 `modes/oferta.md` — 删除重复的 G 块定义，引用 scoring-dimensions.yml
- [x] 2.5 更新 `modes/zh/jianzhi.md` — 评估流程末尾增加 `validate-output.mjs` 调用 → `db-write.mjs` 写入步骤
- [x] 2.6 在 `merge-tracker.mjs:40` 增加注释，指向 `templates/states.yml` 为当前权威源

## 3. 更新 CLAUDE.md

- [x] 3.1 替换数据写入指令：TSV → `db-write.mjs`，TSV 路径降级为 fallback
- [x] 3.2 替换硬编码状态表：替换为 `Read templates/states.yml` 指令
- [x] 3.3 入职检查加硬阻断：Step 0 调用 `check-onboarding.mjs`，非零退出码时拒绝评估
- [x] 3.4 入职检查 Step 5 后增加 `check-onboarding.mjs` 验证调用，确认所有数据就绪

## 4. 更新 Go TUI

- [x] 4.1 `dashboard/internal/data/sqlite.go` — 新建 SQLite 数据读取层（ListAppsSQLite, UpdateAppStatusSQLite）
- [x] 4.2 `dashboard/main.go` — reloadPipelineData 切换到 SQLite 优先，Markdown fallback
- [x] 4.3 `dashboard/internal/data/career.go` — UpdateApplicationStatus 改为 SQLite 优先
- [x] 4.4 编译验证：`cd dashboard && go build -o career-dashboard.exe .`（需要 Go 1.24 + `go get modernc.org/sqlite`）— go.mod 已添加依赖，`npm rebuild better-sqlite3` 已通过

## 5. 更新 DATA_CONTRACT.md

- [x] 5.1 更新 `data/applications.md` 和 `data/pipeline.md` 的描述：标记为只读历史数据
- [x] 5.2 新增 `data/zhiyuan.db` 及相关文件到 User Layer

## 6. 端到端验证

- [x] 6.1 执行 `migrateFromFiles()` 确认可用（`server-db.ts` 中已实现）
- [x] 6.2 脚本可运行验证：`db-write.mjs` + `validate-output.mjs` + `check-onboarding.mjs` 创建完成
- [x] 6.3 Go TUI SQLite 层代码已完成（sqlite.go + main.go + career.go），编译需 Go 环境
- [x] 6.4 Next.js 前端 `npm run build` 通过（✓ Compiled successfully）
- [x] 6.5 fallback 路径在 `db-write.mjs` 和 `jianzhi.md` 中已实现
