# 23 — Postgres 向量记忆与数据治理

本文说明 SQLite、PostgreSQL、pgvector、优秀简历长期记忆和治理后台的当前关系。

---

## 1. 当前结论

项目现在不能简单说“已经完全抛弃 SQLite”。更准确的状态是：

- **PostgreSQL/pgvector 是当前 LAN 运行态**：通过 `DB_DRIVER=postgres` 和 `DATABASE_URL` 启用。
- **SQLite 仍保留为 fallback/archive**：用于本地轻量运行、历史迁移源和归档读取。
- **pgvector 是长期记忆和治理闭环的必要基础**：优秀简历向量检索、通用 memory chunks、Agent Run 台账、复盘治理、Eval 候选都依赖 Postgres 路径。
- **迁移是分阶段切换，不是一次性删除 SQLite**：先迁移、校验、备份，再切 runtime；确认所有关键路由都走 repository 后，才能讨论移除 SQLite fallback。

---

## 2. 数据层分工

| 层 | 当前状态 | 说明 |
|----|----------|------|
| `server-db.ts` | SQLite legacy adapter | `better-sqlite3`，启动时自动迁移；Postgres 模式下会阻止直接 SQLite 写入，除非显式 legacy readonly |
| `data-repositories.ts` | 双驱动抽象层 | 让 users、sessions、reports、jds、cv、offers、reference_resumes 等模块兼容 SQLite/Postgres |
| `postgres.ts` | Postgres 连接与健康检查 | 读取 `DB_DRIVER`、`DATABASE_URL`，检查 pgvector |
| `postgres-schema.sql` | Postgres schema | 包含多用户、报告、Offer、简历草稿、向量记忆、Agent Run、复盘治理等表 |
| `memory/*` | 向量记忆与治理 | 负责 chunk、embedding、检索、反馈晋升、管理员队列 |

---

## 3. Postgres 启用条件

环境变量：

```bash
DB_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
```

可选 embedding 配置：

```bash
MEMORY_EMBEDDING_PROVIDER=openai-compatible
MEMORY_EMBEDDING_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
MEMORY_EMBEDDING_MODEL=text-embedding-v4
MEMORY_EMBEDDING_DIMENSION=1536
MEMORY_EMBEDDING_API_KEY=...
```

当前向量维度固定为 1536。`text-embedding-v4` 可通过 OpenAI-compatible provider 接入，前提是 API URL、模型名、Key 和维度一致。

---

## 4. 迁移与校验脚本

| 命令 | 作用 |
|------|------|
| `npm run check:postgres` | 检查 `DATABASE_URL`、连接和 pgvector 可用性 |
| `npm run migrate:postgres -- --dry-run` | 从 SQLite 生成迁移计划，不切 runtime |
| `npm run migrate:postgres -- --apply` | 将 SQLite 数据迁入 Postgres |
| `npm run check:postgres-migration` | 校验迁移结果 |
| `npm run check:postgres-cutover` | 切换前检查 |
| `npm run backup:postgres` | 备份 Postgres 数据 |
| `npm run restore:postgres` | 恢复 Postgres 数据 |
| `npm run backfill:memory` | 为已有材料补向量索引 |
| `npm run eval:memory` | 跑确定性记忆 eval，不调用真实模型 |
| `npm run smoke:embedding` | 用真实 embedding 配置做 smoke test |

推荐流程：

```text
1. SQLite fallback 环境确认功能可用
2. 配置 PostgreSQL + pgvector
3. check:postgres
4. migrate:postgres --dry-run
5. migrate:postgres --apply
6. check:postgres-migration
7. backup:postgres
8. 设置 DB_DRIVER=postgres
9. check:postgres-cutover
10. 启动服务并检查 Agent Run、Memory、报告、简历、Offer 核心流
```

---

## 5. 向量记忆模型

当前有两类长期记忆：

### 5.1 参考/优秀简历记忆

主要表：

- `reference_resumes`
- `reference_resume_chunks`
- `reference_resume_usage`

流程：

```text
用户上传/粘贴优秀简历
  -> 确认岗位方向
  -> 选择私有或团队共享
  -> 解析 sections
  -> 脱敏和质量评分
  -> chunk
  -> embedding
  -> 检索时作为风格/结构参考
  -> 记录使用反馈
```

岗位方向必须显式确认，不能靠 Agent 猜。常见方向包括：

- `ai_product_manager`
- `ai_operations`
- `ai_presales`
- `data_product_manager`
- `product_manager`
- `general`

团队共享材料不会直接对所有人开放。`team_pending` 或需要审核的材料应先在管理员记忆治理台处理。

### 5.2 通用 memory items/chunks

主要表：

- `memory_items`
- `memory_evidence`
- `memory_status_transitions`
- `memory_chunks`

状态：

```text
candidate -> active
candidate -> rejected
active/rejected -> archived
archived -> candidate
```

这条路径用于把可复用的模式、事实、偏好、反馈逐步沉淀成长期记忆。写入后有读回校验，向量 chunk 有 `pending`、`embedded`、`failed`、`skipped` 状态。

---

## 6. 优秀简历保存规则

用户说“把这份简历保存成优秀简历”时，系统不能直接写入长期记忆，必须先确认至少两个要素：

1. **岗位方向**：例如 AI 产品经理、AI 运营、AI 售前、数据产品经理。
2. **可见性**：默认私有；如果用户明确说局域网共享/团队共享，才进入 team 路径。

如果用户已经说“保存成 AI 产品经理优秀简历”，则可以直接进入保存流程；如果只说“保存成优秀简历”，Agent Chat 会问“要保存到哪个岗位方向”。

保存工具 `save_reference_resume` 的成功条件：

- 来源简历内容存在。
- 岗位方向已确认。
- 参考简历记录已持久化。
- 读回校验通过。

读回失败时，不能告诉用户“已保存为长期记忆”。

---

## 7. 检索与防复制边界

向量记忆的目标是帮助简历优化，而不是照搬优秀简历内容。

当前检索逻辑会考虑：

- 角色方向匹配。
- 相似度。
- 简历质量分。
- 使用反馈可信度。
- 私有/团队可见性。
- no-copy overlap guard。

Agent 使用时应把优秀简历作为“表达结构、项目拆解方式、指标密度、关键词覆盖”的参考，不应把别人的原文直接塞进用户简历。

---

## 8. 管理员治理台

入口：`/admin/memory`

当前可见内容：

- 数据库驱动和向量存储是否可用。
- 参考简历总数、团队共享数、待审核数、禁用数。
- embedding 失败或待处理队列。
- 候选记忆模式。
- 风险参考材料。
- 全部优秀简历材料。

管理员动作包括：

- 审核团队共享材料。
- 禁用低质量或高风险参考。
- 接受/拒绝候选记忆模式。
- 查看 embedding 健康状态。

SQLite 环境下，该页面仍可展示部分参考简历信息，但向量内部治理和候选记忆队列需要 Postgres/pgvector。

---

## 9. 当前限制

- SQLite 还没有完全移除，不能直接删掉 `server-db.ts` 或 `data/zhiyuan.db`，但它已不再是当前 LAN 的主运行时。
- Postgres runtime 需要完整配置 `DB_DRIVER` 和 `DATABASE_URL`。
- pgvector schema 当前固定 1536 维，换 embedding 模型前必须确认维度。
- `eval:memory` 是确定性测试，不证明真实 embedding provider 可用；真实 provider 要跑 `smoke:embedding`。
- 团队共享记忆需要治理，不应默认把所有用户的优秀简历开放给局域网其他用户。
- 长期记忆是增强层，不等于 Agent 已经能自动自我改代码。

---

## 10. 相关文件

- `src/lib/data-repositories.ts`
- `src/lib/postgres.ts`
- `src/lib/postgres-schema.sql`
- `src/lib/reference-resume-vector.ts`
- `src/lib/memory/vector-memory.ts`
- `src/lib/memory/postgres-memory.ts`
- `src/lib/memory/feedback-promotion.ts`
- `src/lib/memory/governance.ts`
- `src/app/admin/memory/page.tsx`
- `src/lib/agent/tools/action/save-reference-resume.ts`
- `scripts/migrate-sqlite-to-postgres.mjs`
- `scripts/check-postgres.mjs`
- `scripts/check-postgres-migration.mjs`
- `scripts/backfill-memory.mjs`
- `docs/POSTGRES_MIGRATION.md`
- `docs/MEMORY_EVALS.md`
