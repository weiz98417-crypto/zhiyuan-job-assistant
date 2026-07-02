# PostgreSQL与pgvector数据层的产品构造

PostgreSQL与pgvector数据层是纸鸢从本地单人应用走向多人、可审计、可长期记忆产品的底座。它不直接呈现为一个用户页面，但决定了用户数据能否隔离、报告能否读回、Agent运行能否复盘、优秀简历和长期记忆能否按语义检索。

## 1. 当前定位

项目当前保留SQLite作为fallback、迁移源和归档读取路径，同时通过环境变量切到PostgreSQL运行态。

| 配置 | 含义 |
|---|---|
| `DB_DRIVER=postgres` | 运行时选择PostgreSQL repository |
| `DATABASE_URL` | PostgreSQL连接串 |
| `POSTGRES_MAX_CONNECTIONS` | 连接池最大连接数，默认5 |
| `POSTGRES_SCHEMA_PATH` | schema路径，默认`src/lib/postgres-schema.sql` |

`src/lib/postgres.ts`负责连接池、schema加载、健康检查和`CREATE EXTENSION IF NOT EXISTS vector`。`src/lib/data-repositories.ts`通过`getDataRepositories()`根据`DB_DRIVER`选择PostgreSQL或SQLite实现。

这个设计不是“抛弃SQLite”，而是用双driver完成迁移、回退和兼容：当前LAN运行以PostgreSQL为权威路径，SQLite保留历史数据迁移和本地轻量运行能力。

## 2. 数据层升级的产品原因

早期单人Demo可以依赖SQLite，因为数据都在本地、并发低、审计要求弱。纸鸢进入多人和Agent治理阶段后，SQLite无法承担这些产品需求：

| 需求 | 为什么需要PostgreSQL/pgvector |
|---|---|
| 多用户隔离 | 所有报告、简历、Offer、画像、会话都要按`user_id`隔离 |
| 读回校验 | 写入报告、JD、简历提案后要同库读取验证 |
| Agent台账 | `agent_runs`、`agent_run_steps`、`agent_run_reviews`需要长期保留 |
| Eval候选 | 失败样本要持久化、去重、流转状态 |
| 团队共享素材 | 参考简历要有visibility、status、approval和质量分 |
| 向量记忆 | 优秀简历和长期记忆需要语义召回，不能只靠全文搜索 |
| 可迁移 | 旧数据需要dry-run、apply、verify，不允许静默丢失归属 |

因此PostgreSQL不是单纯替换数据库，而是产品治理能力的基础设施。

## 3. 主要业务资产表

`src/lib/postgres-schema.sql`覆盖了纸鸢的核心业务资产：

| 表 | 产品含义 |
|---|---|
| `users` | 账号、角色、审批状态、token_version |
| `applications` | 投递追踪记录 |
| `reports` | JD评估报告，包含A-G blocks和关键词 |
| `jds` | 原始JD、来源、正文、关键词、关联报告 |
| `profiles` / `profile_signals` | 求职画像和画像信号 |
| `cv_data` | 当前简历数据 |
| `resume_edit_proposals` | 简历修改提案、hash、状态 |
| `reference_resumes` | 优秀参考简历、可见性、审批、质量分 |
| `reference_resume_chunks` | 参考简历向量切片 |
| `reference_resume_usage` | 参考素材命中与用户反馈 |
| `optimization_preferences` | 简历优化偏好反馈 |
| `sessions` | Agent会话、消息、面试状态、Agent状态 |
| `agent_runs` / `agent_run_steps` | Agent运行台账 |
| `agent_run_reviews` / `agent_eval_candidates` | 复盘和eval候选 |
| `offers` / `offer_reports` | Offer快照和评估报告 |
| `stories` / `interview_*` | 面试故事库、会话和复盘 |
| `memory_items` / `memory_chunks` | 长期记忆和向量切片 |
| `news_cache` | 新闻缓存 |

这些表把纸鸢的页面状态转成可回溯的产品资产。

## 4. Repository抽象

`DataRepositories`定义了业务代码应使用的数据接口：users、cv、resumeEditProposals、applications、reports、jds、profiles、signals、referenceResumes、sessions、stories、offers、offerReports、news、preferences、agentPreferences。

业务代码不应该到处直接调用SQLite或PostgreSQL，而应该通过repository：

```text
业务功能
  -> getDataRepositories()
  -> driver=postgres ? createPostgresRepositories() : createSqliteRepositories()
  -> 对应表读写
```

`postgres-repository-routing.test.ts`验证`DB_DRIVER=postgres`时，核心写入走PostgreSQL query路径，不触碰SQLite `getDb()`。这保证切换不是只改环境变量，而是让运行时读写路径真正切过去。

## 5. 用户隔离

`data-repositories.ts`把大量私有表列入`USER_PRIVATE_TABLES`，包括profiles、profile_signals、sessions、stories、cv_data、applications、agent_preferences、session_memory、optimization_preferences、resume_edit_proposals、reports、jds、offers、offer_reports、reference_resumes、memory_evidence、memory_status_transitions、memory_chunks、memory_items、scan_jobs、scan_queue。

产品上要保证：

1. 普通用户只能读取自己的简历、报告、JD、Offer、画像和会话。
2. 团队共享参考简历只有在`visibility='team'`且状态可用时才可跨用户检索。
3. Admin可以看治理聚合和脱敏预览，但不能把用户隐私作为普通列表明文暴露。
4. 迁移时旧数据缺少`user_id`不能静默归给错误用户。

用户隔离是登录权限之外的第二道边界：auth确认“你是谁”，repository确认“你能读写哪些数据”。

## 6. 简历修改提案的数据结构

`resume_edit_proposals`是防止简历被直接污染的关键表。字段包括：

| 字段 | 含义 |
|---|---|
| `id` | 提案ID |
| `user_id` | 用户归属 |
| `section_id` | 被修改的简历段落 |
| `base_version` / `base_hash` | 修改前版本与内容hash |
| `original_content` | 原文 |
| `proposed_content` / `proposed_hash` | 提案内容与hash |
| `risk_flags_json` | 风险标记 |
| `status` | `pending`、`applied`、`discarded`、`stale`、`rolled_back` |

PostgreSQL实现里应用、丢弃和回滚会使用`FOR UPDATE`锁定提案记录，避免并发状态冲突。这个表把“AI建议修改”与“真正写入简历”隔离开，用户确认和读回校验之前不会直接覆盖简历。

## 7. pgvector与优秀简历检索

`reference_resume_chunks`使用`embedding vector(1536)`存储优秀简历切片向量，核心字段包括：

| 字段 | 用途 |
|---|---|
| `reference_resume_id` | 关联原参考简历 |
| `owner_user_id` | 私有素材归属 |
| `visibility` | private、team、team_pending、disabled等 |
| `status` | active、pending、disabled、index_failed等 |
| `role_category` | 岗位类别 |
| `section_type` | 简历段落类型 |
| `content_hash` | 切片内容去重 |
| `embedding_model` | 向量模型 |
| `embedding_dimension` | 固定1536 |
| `embedding_status` | pending、embedded、failed、skipped |
| `failure_reason` / `retry_count` | 索引失败治理 |
| `quality_score` | 素材质量权重 |

索引包括`owner_user_id + role_category + status`、`visibility + status + role_category`和`embedding_status + updated_at`。这些索引对应三个产品动作：查私有素材、查团队素材、治理失败索引。

## 8. Agent运行与复盘数据

PostgreSQL承载Agent治理链路：

| 表 | 作用 |
|---|---|
| `agent_runs` | 一次Agent任务的主记录，包含task_type、agent_id、status、contract、result、error |
| `agent_run_steps` | 工具调用、验证、错误等步骤证据 |
| `agent_run_reviews` | 确定性复盘结果，包含verdict、score、failure type、evidence、suggested fix |
| `agent_eval_candidates` | 可沉淀为回归验证的失败样本，带dedupe key和状态 |

这套表让产品能追问：用户这次JD评估到底有没有识别图片、有没有调用工具、有没有保存报告、有没有读回、为什么最终失败。

## 9. 迁移脚本

迁移不是直接复制表。项目里有完整迁移和切换检查脚本：

| 脚本 | 作用 |
|---|---|
| `scripts/lib/sqlite-postgres-migration.mjs` | 生成inventory、校验JSON、转换行、处理owner、执行upsert、输出dry-run/apply/verify报告 |
| `scripts/lib/postgres-cutover-check.mjs` | 检查driver、DATABASE_URL、运行时SQLite import、迁移行数、JSON样本、用户隔离 |
| `scripts/check-postgres.mjs` | 检查连接和schema |
| `scripts/check-postgres-migration.mjs` | 检查迁移结果 |
| `scripts/check-postgres-cutover.mjs` | 切换前检查 |
| `scripts/check-jd-eval-partials.mjs` | 检查JD评估报告与JD记录的部分写入问题 |

迁移脚本特别处理旧数据缺少`user_id`的问题：没有默认owner时不能静默迁移；提供默认owner时会记录owner assignment。这样避免历史数据变成无归属资产或串到错误用户。

## 10. 读回与事务边界

数据层失败不能伪装成成功。`persist-eval-jd-verified-write.test.ts`覆盖了PostgreSQL路径下的读回和回滚：

| 场景 | 期望 |
|---|---|
| report/JD写入成功 | 重新读取并验证关键字段 |
| JD读回失败 | transaction rollback |
| 写入失败 | 不继续写memory index |
| report与JD关联不完整 | 不能宣称完整评估已保存 |

这对用户体验很关键：用户看到“评估完成并保存”时，数据库里必须真的有报告/JD记录和可读回证据。

## 11. 健康检查

`checkPostgresHealth()`会执行：

1. 检查`DATABASE_URL`是否配置。未配置时返回`skipped:true`，不是假成功。
2. `SELECT 1 AS ok`验证连接。
3. `CREATE EXTENSION IF NOT EXISTS vector`确保pgvector可用。
4. 查询`pg_extension`确认`vector`扩展存在。
5. 返回schema路径。

`bootstrapPostgresSchema()`会读取`POSTGRES_SCHEMA_PATH`或默认schema，并在执行schema前确保vector扩展存在。schema文件缺失会直接抛错。

## 12. 失败边界

数据层必须显式暴露失败：

| 失败 | 处理 |
|---|---|
| `DATABASE_URL`缺失 | health skipped，不能宣称Postgres可用 |
| schema文件不存在 | 抛出错误 |
| pgvector不可用 | 不能宣称向量记忆可用 |
| 迁移JSON解析失败 | 进入migration report |
| runtime仍有SQLite import | cutover check失败 |
| 写入后读回不一致 | 回滚或返回失败 |
| 用户归属缺失 | dry-run报告，不静默迁移 |

## 13. 验收口径

PostgreSQL与pgvector数据层的验收要看：

1. `DB_DRIVER=postgres`时核心repository走PostgreSQL，不触碰SQLite写入路径。
2. schema覆盖用户、报告、JD、简历、画像、Offer、Agent Run、复盘、eval候选、记忆和向量切片。
3. pgvector扩展可检查、可创建，embedding维度固定为1536。
4. 多用户私有表按`user_id`隔离。
5. 团队共享素材必须有visibility/status/approval边界。
6. 迁移支持dry-run、apply、verify，并报告缺owner、JSON错误和冲突。
7. cutover check能发现runtime SQLite import和迁移校验失败。
8. 写入类产品流程必须有读回证据，读回失败不能提示成功。
