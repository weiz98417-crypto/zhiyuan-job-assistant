## Context

筝筝纸鸢有三个读写数据的组件：(1) Claude Agent（模式系统），(2) Go TUI 仪表盘，(3) Next.js Web 前端。当前状态：

- **Agent** 按 `CLAUDE.md` 指令写入 `batch/tracker-additions/*.tsv` → 由 `merge-tracker.mjs` 合并到 `data/applications.md`
- **Go TUI** 直接解析 `applications.md`，用字符串替换更新状态
- **Next.js** 通过 `server-db.ts` 读写 `data/zhiyuan.db` (SQLite)

`merge-tracker.mjs` 自声明 DEPRECATED（第 1 行），`DATA_CONTRACT.md:67` 声明 SQLite 是规范存储。但 `CLAUDE.md:195` 仍指示 Agent 走已弃用的 TSV 路径。三条写入路径中有两条指向错误目标。

同时存在四个非数据路径问题：(1) LLM 输出未经校验直接持久化，(2) 状态枚举在 4 个位置重复定义，(3) CV/profile 占位符数据不阻断评估，(4) 中英文评分维度结构不一致。

## Goals / Non-Goals

**Goals:**
- Agent 写入路径从 Markdown/TSV 切换到 SQLite，消除弃用桥接层
- LLM 生成的评分、日期、状态在持久化前校验
- `templates/states.yml` 成为状态枚举的唯一权威源
- CV/profile 空数据硬阻断评估流程
- 中英文评分维度统一到一个共享配置文件

**Non-Goals:**
- 不重写 Next.js API 层（已存在且完整）
- 不迁移 `data/applications.md` 中的历史数据（`migrateFromFiles()` 已覆盖）
- 不删除 `merge-tracker.mjs`（保留为只读历史参考）
- 不改变 Go TUI 的整体架构（仅修改数据读写路径）
- 不在此 change 中处理并发问题（属于 `fix-concurrency`）

## Decisions

### Decision 1: Agent 通过 CLI 脚本写入 SQLite

**选择：** 新建 `scripts/db-write.mjs`，Agent 通过 `node scripts/db-write.mjs --action <upsertApp|upsertReport|insertJD> --data '<json>'` 写入。

**替代方案考虑：**
- *Next.js API (fetch)*: 被拒绝——Agent 运行时 Next.js 不一定启动，增加不必要的运行时依赖。`DATA_CONTRACT.md:69` 提到的 `/api/data/*` 是前端自身的读写路径，Agent 不应耦合到前端进程。
- *直接在 mode prompt 中内联 SQL*: 被拒绝——LLM 不应生成原始 SQL。封装在脚本中保证 SQL 安全和类型正确。

**实现：** `db-write.mjs` 是一层薄封装，直接 `import` `server-db.ts` 的导出函数。因为 `server-db.ts` 使用 TypeScript 和 `better-sqlite3`（原生模块），`db-write.mjs` 通过 `esbuild` 或直接 `import()` 对应的编译后 JS 文件。如果编译步骤不可行，则回退到直接使用 `better-sqlite3` 的原生绑定路径。

### Decision 2: LLM 输出校验在 report 生成后、写入前执行

**选择：** 新建 `scripts/validate-output.mjs`，接受 JSON 输入，校验字段格式和范围。

校验规则：
| 字段 | 规则 | 拒绝动作 |
|------|------|---------|
| `score` | `1.0 <= score <= 5.0`，数字类型 | 报告写入拒绝，Agent 重新生成 |
| `date` | `YYYY-MM-DD`，合法日期 | 报告写入拒绝，Agent 重新生成 |
| `status` | 必须在 `states.yml` 的 `states[*].label` 中 | 自动修正为最接近的规范值 |
| `report_path` | 匹配 `reports/\d{3}-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md` | 报告写入拒绝 |

**替代方案：** 在 mode prompt 中让 LLM 自校验——不可靠，LLM 不知道自己的输出格式错误。

### Decision 3: states.yml 通过脚本加载，Go TUI 启动时读取

**选择：** `templates/states.yml` 保持不变作为权威源。Go TUI 用 `gopkg.in/yaml.v3` 在启动时解析。`CLAUDE.md` 中删除硬编码的状态列表，替换为"从 `templates/states.yml` 读取"指令。

**注意：** `merge-tracker.mjs:40` 的硬编码列表保留不动（脚本已弃用，不值得修改）。`CLAUDE.md:220-229` 的硬编码状态表替换为一行引用。

### Decision 4: CV/profile 硬阻断 = onboarding 脚本 + Agent 指令

**选择：** 新建 `scripts/check-onboarding.mjs`：
- 检查 `cv.md` 是否存在且不包含占位符关键词（"请在此处填写"、"在此输入"、"TODO"、空文件）
- 检查 `config/profile.yml` 是否不是 `profile.example.zh.yml` 的副本（比对关键字段：`name` 不为 "张三"、"Your Name" 等示例值）
- 退出码 0 = 通过，1 = 阻断

`CLAUDE.md` 入职检查改为：Step 1 和 Step 2 必须调用此脚本，非零退出码时**拒绝执行任何评估模式**。之前是软提示（"问用户要不要填"），现在改为硬阻断（"没数据就不干活"）。

### Decision 5: 评分维度统一到 YAML 配置

**选择：** 新建 `modes/scoring-dimensions.yml`，定义评分块结构：

```yaml
dimensions:
  - id: A
    key: role_summary
    label_zh: 岗位摘要
    label_en: Role Summary
    weight: 15
    applicable: all
  - id: B
    key: cv_match
    label_zh: 简历匹配
    label_en: CV Match
    weight: 20
    applicable: all
  # ... C-G
```

`modes/_shared.md` 和 `modes/zh/_shared.md` 中删除内联评分定义，替换为 `Read modes/scoring-dimensions.yml` 指令。语言差异仅保留在 label 字段和评估 prompt 措辞中，不改变评分结构。

## Risks / Trade-offs

1. **[R] `better-sqlite3` 原生模块兼容性** → `db-write.mjs` 需要在 Windows/macOS/Linux 上都可用。`better-sqlite3` 是预编译的，在不同平台可能需要重新编译。
   → **缓解:** 检查现有 `node_modules/better-sqlite3/build/` 是否已存在对应平台的 `.node` 文件。如果不可用，回退到通过 Next.js API 写入（要求用户启动前端）。

2. **[R] Go TUI 从 YAML 读取增加启动开销** → 文件很小 (<1KB)，解析开销可忽略。如果担心，可以在构建时嵌入(golang `embed`)。

3. **[R] check-onboarding.mjs 的"占位符检测"可能误判** → 用户可能真的叫类似的名字或有特殊格式。
   → **缓解:** 检查逻辑用启发式规则而非精确匹配——检测明显的模板残留（如"请在此处填写"、"TODO"、空文件），而不是名字本身。

4. **[R] `server-db.ts` 引用路径** → `db-write.mjs` 在项目根目录运行，需要正确引用 `frontend/src/lib/server-db.ts`。
   → **缓解:** 使用 `path.resolve(__dirname, 'frontend', '.next', 'server', ...)` 或直接 import `better-sqlite3` 并复制最小必要的 DB 路径逻辑。

## Migration Plan

1. 创建 `scripts/db-write.mjs` + `scripts/validate-output.mjs` + `scripts/check-onboarding.mjs`
2. 创建 `modes/scoring-dimensions.yml`
3. 更新 `CLAUDE.md`: (a) 数据写入指令指向 `db-write.mjs`, (b) 状态表替换为 states.yml 引用, (c) 入职检查加硬阻断脚本调用
4. 更新 `modes/_shared.md` + `modes/zh/_shared.md`: 评分结构引用 scoring-dimensions.yml
5. 更新 `modes/zh/jianzhi.md` + `modes/oferta.md`: 评估后调用 `validate-output.mjs`
6. 更新 Go TUI: `career.go` 数据源切换到 SQLite，启动时加载 states.yml
7. 测试端到端：Agent 评估 → db-write.mjs → SQLite → Go TUI 读取 → Next.js 读取
8. 降级策略：如果 `db-write.mjs` 不可用，回退到旧的 TSV 写入路径（保留 `merge-tracker.mjs` 为只读回退）

## Open Questions

- `better-sqlite3` 在 Windows 上的预编译状态？当前 `data/zhiyuan.db` 已存在，说明 Next.js 前端已成功初始化过。需要验证 Agent 所在的 Node.js 环境能否 `require('better-sqlite3')`。
- Go TUI 是否应该完全移除 `applications.md` 解析逻辑，改为纯 SQLite 读取？建议是——但需要确保迁移脚本 `migrateFromFiles()` 已执行。
