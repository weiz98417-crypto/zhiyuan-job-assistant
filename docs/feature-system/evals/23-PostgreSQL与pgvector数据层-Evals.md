# PostgreSQL与pgvector数据层 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 PostgreSQL与pgvector数据层 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

Postgres schema、repositories、SQLite cutover、migration inventory、pgvector memory、embedding、backup/restore 和事务读回。

## 项目事实

### 关键实现面
- `src/lib/postgres.ts`
- `src/lib/postgres-schema.sql`
- `src/lib/data-repositories.ts`
- `src/lib/memory/vector-memory.ts`
- `src/lib/memory/postgres-memory.ts`
- `scripts/migrate-sqlite-to-postgres.mjs`
- `scripts/check-postgres-cutover.mjs`

### 已落地或部分落地的 eval 资产
- `src/__tests__/postgres-repository-routing.test.ts`
- `src/__tests__/vector-memory.test.ts`
- `src/__tests__/sqlite-postgres-migration.test.ts`
- `src/__tests__/agent-quality-runtime-foundation.test.ts`
- `src/__tests__/persist-eval-jd-verified-write.test.ts`
- `src/__tests__/offer-persistence-verified-write.test.ts`

### 从现有测试读到的行为
- postgres-repository-routing.test.ts 已覆盖 CV/session/report/JD 写入走 Postgres repositories，不触碰 SQLite。
- vector-memory.test.ts 已覆盖 pgvector schema、chunking、embedding dimension、provider 配置、user/source filters、失败 chunk 保留。
- sqlite-postgres-migration.test.ts 已覆盖 migration inventory、volatile news cache、null user_id 默认 owner 和 jsonb 校验。

### 待补 eval 缺口
- 补 backup/restore 脚本的 dry-run eval。
- 补 pgvector extension 缺失时的健康检查 eval。
- 补 Postgres 连接失败到 SQLite archive 的边界 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 backup/restore 脚本的 dry-run eval

**为什么要补**: 这是当前 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/postgres-repository-routing.test.ts`、`src/__tests__/vector-memory.test.ts`、`src/__tests__/sqlite-postgres-migration.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`、`src/__tests__/persist-eval-jd-verified-write.test.ts`。
- fixture 必须包含：repository backend、table name、userId、transaction id、embedding dimensions 和 json column。
- 断言必须读取：Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 pgvector extension 缺失时的健康检查 eval

**为什么要补**: 这是当前 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/postgres-repository-routing.test.ts`、`src/__tests__/vector-memory.test.ts`、`src/__tests__/sqlite-postgres-migration.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`、`src/__tests__/persist-eval-jd-verified-write.test.ts`。
- fixture 必须包含：repository backend、table name、userId、transaction id、embedding dimensions 和 json column。
- 断言必须读取：Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 Postgres 连接失败到 SQLite archive 的边界 eval

**为什么要补**: 这是当前 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/postgres-repository-routing.test.ts`、`src/__tests__/vector-memory.test.ts`、`src/__tests__/sqlite-postgres-migration.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`、`src/__tests__/persist-eval-jd-verified-write.test.ts`。
- fixture 必须包含：repository backend、table name、userId、transaction id、embedding dimensions 和 json column。
- 断言必须读取：Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 PostgreSQL与pgvector数据层 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. CV/session/report/JD 写入走 Postgres repository

**状态**: 已有自动化覆盖

**项目依据**:
- 1. `DB_DRIVER=postgres`时核心repository走PostgreSQL，不触碰SQLite写入路径。 2. schema覆盖用户、报告、JD、简历、画像、Offer、Agent Run、复盘、eval候选、记忆和向量切片。 3. pgvector扩展可检查、可创建，embedding维度固定为1536。 4. 多用户私有表按`user...
- `postgres-repository-routing.test.ts`验证`DB_DRIVER=postgres`时，核心写入走PostgreSQL query路径，不触碰SQLite `getDb()`。这保证切换不是只改环境变量，而是让运行时读写路径真正切过去。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“CV/session/report/JD 写入走 Postgres repository”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“CV/session/report/JD 写入走 Postgres repository”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“CV/session/report/JD 写入走 Postgres repository”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/postgres-repository-routing.test.ts`: routes CV/session/report/JD writes through Postgres repositories without touching SQLite
- `src/__tests__/persist-eval-jd-verified-write.test.ts`: rolls back the PostgreSQL transaction when JD read-back verification fails

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. memory item/evidence/chunk 表和索引存在

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- `data-repositories.ts`把大量私有表列入`USER_PRIVATE_TABLES`，包括profiles、profile_signals、sessions、stories、cv_data、applications、agent_preferences、session_memory、optimization_preferences、resum...
- 索引包括`owner_user_id + role_category + status`、`visibility + status + role_category`和`embedding_status + updated_at`。这些索引对应三个产品动作：查私有素材、查团队素材、治理失败索引。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“memory item/evidence/chunk 表和索引存在”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“memory item/evidence/chunk 表和索引存在”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“memory item/evidence/chunk 表和索引存在”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/postgres-repository-routing.test.ts`: routes CV/session/report/JD writes through Postgres repositories without touching SQLite
- `src/__tests__/vector-memory.test.ts`: defines memory item, evidence, and chunk tables with pgvector metadata
- `src/__tests__/vector-memory.test.ts`: adds user, source, status, and recency indexes

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 迁移 inventory 排除非 durable FTS 表

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 项目当前保留SQLite作为fallback、迁移源和归档读取路径，同时通过环境变量切到PostgreSQL运行态。
- 这个设计不是“抛弃SQLite”，而是用双driver完成迁移、回退和兼容：当前LAN运行以PostgreSQL为权威路径，SQLite保留历史数据迁移和本地轻量运行能力。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“迁移 inventory 排除非 durable FTS 表”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“迁移 inventory 排除非 durable FTS 表”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“迁移 inventory 排除非 durable FTS 表”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/postgres-repository-routing.test.ts`: routes CV/session/report/JD writes through Postgres repositories without touching SQLite
- `src/__tests__/vector-memory.test.ts`: defines memory item, evidence, and chunk tables with pgvector metadata
- `src/__tests__/vector-memory.test.ts`: adds user, source, status, and recency indexes

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. JSON columns 插入 jsonb 前校验

**状态**: 已有自动化覆盖

**项目依据**:
- 1. `DB_DRIVER=postgres`时核心repository走PostgreSQL，不触碰SQLite写入路径。 2. schema覆盖用户、报告、JD、简历、画像、Offer、Agent Run、复盘、eval候选、记忆和向量切片。 3. pgvector扩展可检查、可创建，embedding维度固定为1536。 4. 多用户私有表按`user...
- PostgreSQL实现里应用、丢弃和回滚会使用`FOR UPDATE`锁定提案记录，避免并发状态冲突。这个表把“AI建议修改”与“真正写入简历”隔离开，用户确认和读回校验之前不会直接覆盖简历。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“JSON columns 插入 jsonb 前校验”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JSON columns 插入 jsonb 前校验”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JSON columns 插入 jsonb 前校验”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/sqlite-postgres-migration.test.ts`: validates JSON columns before jsonb insertion
- `src/__tests__/persist-eval-jd-verified-write.test.ts`: accepts PostgreSQL jsonb read-back values as semantic JSON matches

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 查询必须 user scoped

**状态**: 已有自动化覆盖

**项目依据**:
- 1. `DB_DRIVER=postgres`时核心repository走PostgreSQL，不触碰SQLite写入路径。 2. schema覆盖用户、报告、JD、简历、画像、Offer、Agent Run、复盘、eval候选、记忆和向量切片。 3. pgvector扩展可检查、可创建，embedding维度固定为1536。 4. 多用户私有表按`user...
- `DataRepositories`定义了业务代码应使用的数据接口：users、cv、resumeEditProposals、applications、reports、jds、profiles、signals、referenceResumes、sessions、stories、offers、offerReports、news、preferences、agen...
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“查询必须 user scoped”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“查询必须 user scoped”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“查询必须 user scoped”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/vector-memory.test.ts`: builds retrieval SQL scoped by user and source filters

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. private memory rerank 不跨用户

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 普通用户只能读取自己的简历、报告、JD、Offer、画像和会话。 2. 团队共享参考简历只有在`visibility='team'`且状态可用时才可跨用户检索。 3. Admin可以看治理聚合和脱敏预览，但不能把用户隐私作为普通列表明文暴露。 4. 迁移时旧数据缺少`user_id`不能静默归给错误用户。
- PostgreSQL与pgvector数据层是纸鸢从本地单人应用走向多人、可审计、可长期记忆产品的底座。它不直接呈现为一个用户页面，但决定了用户数据能否隔离、报告能否读回、Agent运行能否复盘、优秀简历和长期记忆能否按语义检索。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“private memory rerank 不跨用户”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“private memory rerank 不跨用户”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“private memory rerank 不跨用户”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/postgres-repository-routing.test.ts`: routes CV/session/report/JD writes through Postgres repositories without touching SQLite
- `src/__tests__/vector-memory.test.ts`: defines memory item, evidence, and chunk tables with pgvector metadata
- `src/__tests__/vector-memory.test.ts`: adds user, source, status, and recency indexes

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. read-back 失败 transaction rollback

**状态**: 已有自动化覆盖

**项目依据**:
- 数据层失败不能伪装成成功。`persist-eval-jd-verified-write.test.ts`覆盖了PostgreSQL路径下的读回和回滚：
- PostgreSQL实现里应用、丢弃和回滚会使用`FOR UPDATE`锁定提案记录，避免并发状态冲突。这个表把“AI建议修改”与“真正写入简历”隔离开，用户确认和读回校验之前不会直接覆盖简历。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“read-back 失败 transaction rollback”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“read-back 失败 transaction rollback”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“read-back 失败 transaction rollback”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: does not allow read-back mismatch to report success
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: allows final resume success through an applied proposal with read-back evidence
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: detects missing read-back evidence for high-risk action tools
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: forces high-risk write tools to fail when success lacks read-back evidence

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. embedding dimension 不匹配拒绝

**状态**: 已有自动化覆盖

**项目依据**:
- `reference_resume_chunks`使用`embedding vector(1536)`存储优秀简历切片向量，核心字段包括：
- 索引包括`owner_user_id + role_category + status`、`visibility + status + role_category`和`embedding_status + updated_at`。这些索引对应三个产品动作：查私有素材、查团队素材、治理失败索引。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“embedding dimension 不匹配拒绝”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“embedding dimension 不匹配拒绝”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“embedding dimension 不匹配拒绝”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/vector-memory.test.ts`: produces deterministic mock embeddings

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. cutover scan 漏生产 SQLite import

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. `DB_DRIVER=postgres`时核心repository走PostgreSQL，不触碰SQLite写入路径。 2. schema覆盖用户、报告、JD、简历、画像、Offer、Agent Run、复盘、eval候选、记忆和向量切片。 3. pgvector扩展可检查、可创建，embedding维度固定为1536。 4. 多用户私有表按`user...
- `data-repositories.ts`把大量私有表列入`USER_PRIVATE_TABLES`，包括profiles、profile_signals、sessions、stories、cv_data、applications、agent_preferences、session_memory、optimization_preferences、resum...
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“cutover scan 漏生产 SQLite import”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“cutover scan 漏生产 SQLite import”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“cutover scan 漏生产 SQLite import”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/postgres-repository-routing.test.ts`: routes CV/session/report/JD writes through Postgres repositories without touching SQLite
- `src/__tests__/vector-memory.test.ts`: defines memory item, evidence, and chunk tables with pgvector metadata
- `src/__tests__/vector-memory.test.ts`: adds user, source, status, and recency indexes

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. archive mode 被写入

**状态**: 已有自动化覆盖

**项目依据**:
- `postgres-repository-routing.test.ts`验证`DB_DRIVER=postgres`时，核心写入走PostgreSQL query路径，不触碰SQLite `getDb()`。这保证切换不是只改环境变量，而是让运行时读写路径真正切过去。
- PostgreSQL实现里应用、丢弃和回滚会使用`FOR UPDATE`锁定提案记录，避免并发状态冲突。这个表把“AI建议修改”与“真正写入简历”隔离开，用户确认和读回校验之前不会直接覆盖简历。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“archive mode 被写入”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“archive mode 被写入”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“archive mode 被写入”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: keeps migration verification strict but allows target drift in cutover mode
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: blocks SQLite runtime access under Postgres unless archive mode is readonly
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: opens SQLite as a read-only archive when explicitly requested

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. embedding 失败丢 chunk

**状态**: 已有自动化覆盖

**项目依据**:
- 索引包括`owner_user_id + role_category + status`、`visibility + status + role_category`和`embedding_status + updated_at`。这些索引对应三个产品动作：查私有素材、查团队素材、治理失败索引。
- 1. `DB_DRIVER=postgres`时核心repository走PostgreSQL，不触碰SQLite写入路径。 2. schema覆盖用户、报告、JD、简历、画像、Offer、Agent Run、复盘、eval候选、记忆和向量切片。 3. pgvector扩展可检查、可创建，embedding维度固定为1536。 4. 多用户私有表按`user...
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“embedding 失败丢 chunk”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“embedding 失败丢 chunk”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“embedding 失败丢 chunk”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/vector-memory.test.ts`: defines memory item, evidence, and chunk tables with pgvector metadata
- `src/__tests__/vector-memory.test.ts`: rejects embedding dimensions that do not match the schema
- `src/__tests__/vector-memory.test.ts`: can reuse DASHSCOPE_API_KEY when MEMORY_EMBEDDING_API_KEY is not set
- `src/__tests__/vector-memory.test.ts`: produces deterministic mock embeddings

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. null user_id 静默迁移

**状态**: 已有自动化覆盖

**项目依据**:
- 迁移脚本特别处理旧数据缺少`user_id`的问题：没有默认owner时不能静默迁移；提供默认owner时会记录owner assignment。这样避免历史数据变成无归属资产或串到错误用户。
- 1. 普通用户只能读取自己的简历、报告、JD、Offer、画像和会话。 2. 团队共享参考简历只有在`visibility='team'`且状态可用时才可跨用户检索。 3. Admin可以看治理聚合和脱敏预览，但不能把用户隐私作为普通列表明文暴露。 4. 迁移时旧数据缺少`user_id`不能静默归给错误用户。
- 主要实现面：`src/lib/postgres.ts`、`src/lib/postgres-schema.sql`、`src/lib/data-repositories.ts`、`src/lib/memory/vector-memory.ts`。

**输入/fixture**:
- 正例：CV/session/report/JD 写入 Postgres、memory chunks、migration inventory，用来验证“null user_id 静默迁移”的成功路径。
- 反例：SQLite archive 写入、null user_id、embedding dimension mismatch、read-back failure，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：repository backend、table name、userId、transaction id、embedding dimensions 和 json column；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 PostgreSQL repository routing、pgvector memory、migration inventory 和 jsonb 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“null user_id 静默迁移”对应动作，并记录请求、工具调用或页面状态。
3. 读取 Postgres rows、transaction rollback、schema/index、inventory report 和 scoped query，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“null user_id 静默迁移”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 PostgreSQL与pgvector数据层 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/sqlite-postgres-migration.test.ts`: requires an explicit default owner for null or missing user_id rows

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/postgres-repository-routing.test.ts`
  - routes CV/session/report/JD writes through Postgres repositories without touching SQLite
- `src/__tests__/vector-memory.test.ts`
  - defines memory item, evidence, and chunk tables with pgvector metadata
  - adds user, source, status, and recency indexes
  - chunks source text with source metadata
  - rejects embedding dimensions that do not match the schema
  - can reuse DASHSCOPE_API_KEY when MEMORY_EMBEDDING_API_KEY is not set
  - produces deterministic mock embeddings
  - sends the configured dimension to OpenAI-compatible providers without exposing secrets
  - builds retrieval SQL scoped by user and source filters
  - ...
- `src/__tests__/sqlite-postgres-migration.test.ts`
  - enumerates runtime SQLite tables and excludes non-durable FTS tables
  - marks news cache as volatile so verification ignores runtime cache churn
  - requires an explicit default owner for null or missing user_id rows
  - validates JSON columns before jsonb insertion
- `src/__tests__/agent-quality-runtime-foundation.test.ts`
  - classifies every registered action tool
  - rejects placeholder document content and markdown control output
  - does not allow read-back mismatch to report success
  - reports blocking production SQLite imports and allowlisted bridge files
  - keeps migration verification strict but allows target drift in cutover mode
  - defines durable Postgres tables for agent runs and steps
  - requires task criteria before an agent can claim durable success
  - treats current resume lookup as read-only instead of a resume write
  - ...
- `src/__tests__/persist-eval-jd-verified-write.test.ts`
  - verifies the saved JD by reading it back before returning success
  - accepts PostgreSQL jsonb read-back values as semantic JSON matches
  - rolls back the PostgreSQL transaction when JD read-back verification fails
- `src/__tests__/offer-persistence-verified-write.test.ts`
  - verifies an offer by reading it back before returning success
  - verifies an offer report and its linked offer latest_report_id before returning success


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- PostgreSQL与pgvector数据层 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
