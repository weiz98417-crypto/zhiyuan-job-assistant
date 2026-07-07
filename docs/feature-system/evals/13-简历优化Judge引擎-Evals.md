# 简历优化Judge引擎 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 简历优化Judge引擎 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

optimize-section API、operation/effort、JD 滤网、参考简历记忆、画像、写作指南和进入 proposal 前的质量门。

## 项目事实

### 关键实现面
- `src/app/api/cv/optimize-section/route.ts`
- `src/app/cv/optimize-panel.tsx`
- `src/lib/judge-engine.ts`
- `src/lib/excellent-resume-patterns.ts`
- `src/lib/reference-resume-vector.ts`
- `src/lib/agent/tools/action/optimize-resume-section.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`
- `src/__tests__/excellent-resume-patterns.test.ts`
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`
- `src/__tests__/reference-resume-vector.test.ts`
- `src/__tests__/resume-save-guard.test.ts`
- `src/__tests__/memory-eval-harness.test.ts`

### 从现有测试读到的行为
- excellent-resume-patterns.test.ts 已覆盖优秀简历 pattern 提取与使用。
- reference-resume-vector.test.ts 已覆盖语义参考简历进入 CV optimization 且无匹配时 fallback。
- memory-eval-harness.test.ts 已覆盖优化输出迁移结构但不长句复制。

### 待补 eval 缺口
- 补 cv-optimize-judge.test.ts 固定 operation 与 effort 的输出差异。
- 补 [XX] 占位符和说明性 Markdown 禁止进入 proposal 的 eval。
- 补 JD 信号、画像信号、优秀简历片段三者冲突时的优先级 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 cv-optimize-judge.test.ts 固定 operation 与 effort 的输出差异

**为什么要补**: 这是当前 judge-engine、cv optimize route、reference snippets 和 proposal 写入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/cv-optimize-postgres-boundary.test.ts`、`src/__tests__/excellent-resume-patterns.test.ts`、`src/__tests__/excellent-resume-memory-evolution.eval.test.ts`、`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/resume-save-guard.test.ts`。
- fixture 必须包含：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash。
- 断言必须读取：优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 [XX] 占位符和说明性 Markdown 禁止进入 proposal 的 eval

**为什么要补**: 这是当前 judge-engine、cv optimize route、reference snippets 和 proposal 写入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/cv-optimize-postgres-boundary.test.ts`、`src/__tests__/excellent-resume-patterns.test.ts`、`src/__tests__/excellent-resume-memory-evolution.eval.test.ts`、`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/resume-save-guard.test.ts`。
- fixture 必须包含：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash。
- 断言必须读取：优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 JD 信号、画像信号、优秀简历片段三者冲突时的优先级 eval

**为什么要补**: 这是当前 judge-engine、cv optimize route、reference snippets 和 proposal 写入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/cv-optimize-postgres-boundary.test.ts`、`src/__tests__/excellent-resume-patterns.test.ts`、`src/__tests__/excellent-resume-memory-evolution.eval.test.ts`、`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/resume-save-guard.test.ts`。
- fixture 必须包含：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash。
- 断言必须读取：优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 简历优化Judge引擎 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 单 section 优化返回结构化建议

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 这些边界让优化结果不会在“没内容、没模型、没结构化返回”的情况下伪装成功。
- 纸鸢求职助手的简历优化 Judge 引擎，不是“帮我润色一下简历”的 prompt。它是简历改写前的决策层：系统要判断这次优化到底是全面优化、STAR 重组、量化增强还是关键词注入；要控制改写强度；要参考目标 JD、优秀简历记忆、用户画像和历史偏好；还要把结果限制在可审阅、可提案、可保存的范围内。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“单 section 优化返回结构化建议”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“单 section 优化返回结构化建议”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“单 section 优化返回结构化建议”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers
- `src/__tests__/excellent-resume-patterns.test.ts`: extracts reusable writing patterns with evidence and rejects low-value fragments

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. JD 相关信号影响 bullet 改写

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 纸鸢求职助手的简历优化 Judge 引擎，不是“帮我润色一下简历”的 prompt。它是简历改写前的决策层：系统要判断这次优化到底是全面优化、STAR 重组、量化增强还是关键词注入；要控制改写强度；要参考目标 JD、优秀简历记忆、用户画像和历史偏好；还要把结果限制在可审阅、可提案、可保存的范围内。
- - 只是让句子更专业，不改变内容。 - 按 STAR 结构重组项目。 - 补充量化维度，但不编造具体数字。 - 针对某个 JD 植入关键词。 - 参考优秀简历的结构和表达密度。 - 根据用户职业画像突出 AI 产品、数据产品、运营或其他方向。 - 根据用户过去接受或拒绝的改写风格调整输出。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“JD 相关信号影响 bullet 改写”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD 相关信号影响 bullet 改写”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD 相关信号影响 bullet 改写”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers
- `src/__tests__/excellent-resume-patterns.test.ts`: extracts reusable writing patterns with evidence and rejects low-value fragments

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 优秀简历 pattern 只作为风格参考

**状态**: 已有自动化覆盖

**项目依据**:
- - 只是让句子更专业，不改变内容。 - 按 STAR 结构重组项目。 - 补充量化维度，但不编造具体数字。 - 针对某个 JD 植入关键词。 - 参考优秀简历的结构和表达密度。 - 根据用户职业画像突出 AI 产品、数据产品、运营或其他方向。 - 根据用户过去接受或拒绝的改写风格调整输出。
- 纸鸢求职助手的简历优化 Judge 引擎，不是“帮我润色一下简历”的 prompt。它是简历改写前的决策层：系统要判断这次优化到底是全面优化、STAR 重组、量化增强还是关键词注入；要控制改写强度；要参考目标 JD、优秀简历记忆、用户画像和历史偏好；还要把结果限制在可审阅、可提案、可保存的范围内。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“优秀简历 pattern 只作为风格参考”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“优秀简历 pattern 只作为风格参考”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“优秀简历 pattern 只作为风格参考”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: boundary: non-resume screenshots do not enter excellent-resume save flow
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: regression: pattern extraction produces abstract memory instead of copied resume text
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 优化结果进入 proposal 而非直接覆盖 CV

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/cv-optimize-postgres-boundary.test.ts`：验证优化接口在 PostgreSQL 边界下的行为。 - `src/__tests__/excellent-resume-patterns.test.ts`：验证优秀简历模式可被抽取和检索。 - `src/__tests__/excellent-r...
- 如果用户没有确认，优化结果不应该进入正式简历。这个边界保证了“生成”和“写入”分开治理。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“优化结果进入 proposal 而非直接覆盖 CV”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“优化结果进入 proposal 而非直接覆盖 CV”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“优化结果进入 proposal 而非直接覆盖 CV”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 缺 JD 时不伪造岗位匹配

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 目标岗位。 - 目标公司。 - 最多 8 个核心关键词。 - 与 JD 相关的经历优先详细处理。 - 与 JD 无关的经历可以降低详细程度，但不能跳过。
- - 忽略 JD，输出通用简历。 - 过度迎合 JD，把用户事实改成岗位要求。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“缺 JD 时不伪造岗位匹配”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“缺 JD 时不伪造岗位匹配”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“缺 JD 时不伪造岗位匹配”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers
- `src/__tests__/excellent-resume-patterns.test.ts`: extracts reusable writing patterns with evidence and rejects low-value fragments

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 参考简历不能被长句复制

**状态**: 已有自动化覆盖

**项目依据**:
- 这三类参考的边界是一样的：只能迁移结构、表达密度和故事逻辑，不能复制原文，也不能把参考简历里的事实写到用户简历里。
- - Operation 是否被执行，而不是被 JD 或参考简历覆盖。 - Effort 是否改变改写幅度和占位符数量。 - 有 JD 时是否生成定向和通用两个明显不同的方案。 - 参考简历是否只迁移结构，没有复制原文。 - 用户未确认前是否没有写入正式 CV。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“参考简历不能被长句复制”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“参考简历不能被长句复制”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“参考简历不能被长句复制”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: baseline: pasted excellent resume with role category can complete a save action
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: baseline: screenshot-extracted resume without role category asks a follow-up while preserving text
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: boundary: non-resume screenshots do not enter excellent-resume save flow
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: regression: pattern extraction produces abstract memory instead of copied resume text

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 低质量 fragment 不进入 active guidance

**状态**: 已有自动化覆盖

**项目依据**:
- 第三类是抽象模式记忆。`retrieveExcellentResumePatternMemory()` 最多取 6 条 active 模式，例如：
- 这些偏好会进入 `buildPreferencePrompt()`，让之后的优化更倾向用户接受过的风格，减少用户拒绝过的风格。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“低质量 fragment 不进入 active guidance”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“低质量 fragment 不进入 active guidance”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“低质量 fragment 不进入 active guidance”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/memory-eval-harness.test.ts`: regression: weak candidate patterns are not retrieved as active guidance

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. Postgres 边界不写回 SQLite CV

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/cv-optimize-postgres-boundary.test.ts`：验证优化接口在 PostgreSQL 边界下的行为。 - `src/__tests__/excellent-resume-patterns.test.ts`：验证优秀简历模式可被抽取和检索。 - `src/__tests__/excellent-r...
- 这些边界让优化结果不会在“没内容、没模型、没结构化返回”的情况下伪装成功。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“Postgres 边界不写回 SQLite CV”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Postgres 边界不写回 SQLite CV”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Postgres 边界不写回 SQLite CV”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. operation ignored 导致扩写/精简相同

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前源码注释里直接写了优先级模型：`Operation > JD ≈ Reference > Effort`。也就是说，操作类型决定核心任务，JD 和参考简历决定侧重点和表达方式，Effort 决定执行深度，而不是反过来让模型自由发挥。
- Operation 是最高优先级维度。它决定本次优化的主任务。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“operation ignored 导致扩写/精简相同”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“operation ignored 导致扩写/精简相同”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“operation ignored 导致扩写/精简相同”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers
- `src/__tests__/excellent-resume-patterns.test.ts`: extracts reusable writing patterns with evidence and rejects low-value fragments

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. effort ignored 导致大改小改相同

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前源码注释里直接写了优先级模型：`Operation > JD ≈ Reference > Effort`。也就是说，操作类型决定核心任务，JD 和参考简历决定侧重点和表达方式，Effort 决定执行深度，而不是反过来让模型自由发挥。
- Effort 控制两件事：prompt 里的改写深度，以及模型温度。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“effort ignored 导致大改小改相同”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“effort ignored 导致大改小改相同”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“effort ignored 导致大改小改相同”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers
- `src/__tests__/excellent-resume-patterns.test.ts`: extracts reusable writing patterns with evidence and rejects low-value fragments

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 优秀简历片段污染用户简历正文

**状态**: 已有自动化覆盖

**项目依据**:
- - 用户想轻微润色，AI 却大幅重写。 - 用户想补关键词，AI 却做成 STAR 重组。 - 用户没有真实数据，AI 直接编出百分比和规模。 - 参考简历被照抄，污染用户简历真实性。 - JD 要求被过度放大，原有真实经历被扭曲。 - 用户每次拒绝的风格，下次系统还继续生成。
- 第二类是语义检索片段。`retrieveReferenceResumeSnippets()` 会根据意图、角色、JD、关键词和当前 section 内容，从 pgvector 索引里找同岗位、同板块、相似度高的优秀简历片段，最多取 4 条。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“优秀简历片段污染用户简历正文”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“优秀简历片段污染用户简历正文”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“优秀简历片段污染用户简历正文”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: boundary: non-resume screenshots do not enter excellent-resume save flow
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: scores complete, quantified resumes higher than fragments

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. proposal 缺 base hash

**状态**: 已有自动化覆盖

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/app/api/cv/optimize-section/route.ts`、`src/app/cv/optimize-panel.tsx`、`src/lib/judge-engine.ts`、`src/lib/excellent-resume-patterns.ts`。

**输入/fixture**:
- 正例：一个 section、一份 JD、优秀简历 pattern 和 operation/effort 参数，用来验证“proposal 缺 base hash”的成功路径。
- 反例：缺 JD、低质量 fragment、复制参考简历长句、Postgres/SQLite 边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sectionKey、operation、effort、jd signals、reference ids 和 proposal base hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 judge-engine、cv optimize route、reference snippets 和 proposal 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“proposal 缺 base hash”对应动作，并记录请求、工具调用或页面状态。
3. 读取 优化建议、proposal 草稿、copy overlap、reference retrieval 和 no-match fallback，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“proposal 缺 base hash”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历优化Judge引擎 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: short-circuits duplicate imports by source hash
- `src/__tests__/resume-save-guard.test.ts`: builds proposal action plans from refreshed chat history
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/cv-optimize-postgres-boundary.test.ts`
  - keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
  - exposes recent optimization preferences through both repository drivers
- `src/__tests__/excellent-resume-patterns.test.ts`
  - extracts reusable writing patterns with evidence and rejects low-value fragments
  - formats abstract pattern memory separately from raw reference snippets
  - wires save, optimize retrieval, and feedback usage endpoints
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`
  - baseline: pasted excellent resume with role category can complete a save action
  - baseline: screenshot-extracted resume without role category asks a follow-up while preserving text
  - boundary: non-resume screenshots do not enter excellent-resume save flow
  - boundary: private retrieval is owner scoped while approved team references can be shared
  - regression: accepted references rank up and rejected references rank down
  - regression: pattern extraction produces abstract memory instead of copied resume text
- `src/__tests__/reference-resume-vector.test.ts`
  - detects explicit excellent resume save intent
  - recognizes complete resume-like text and rejects noisy fragments
  - normalizes role categories and visibility values
  - redacts personal contact data before shared retrieval
  - scores complete, quantified resumes higher than fragments
  - uses feedback as a small ranking signal without promoting bad samples
  - adds vector chunks and usage tables to PostgreSQL schema
  - does not delete reference_resume_chunks through the user_id cleanup list
  - ...
- `src/__tests__/resume-save-guard.test.ts`
  - builds a real save plan from a pasted revised skills list
  - builds a save plan from the latest optimization tool result
  - does not hijack excellent reference resume save requests
  - builds proposal action plans from refreshed chat history
  - rejects placeholder edit instructions instead of treating them as project content
  - rewrites unsupported save claims when no save tool succeeded
  - routes legacy section saves through a read-back verified proposal
  - creates a read-back verified resume edit proposal instead of writing CV directly
  - ...
- `src/__tests__/memory-eval-harness.test.ts`
  - defines the AI PM wedge fixtures used by deterministic evals
  - creates repeatable 1536-dimensional mock embeddings
  - runs seeded reference retrieval and collects ranked source labels
  - reports retrieval hits, source labels, quality delta, copy overlap, and policy violations
  - baseline: pasted excellent resume save can be chunked and embedded
  - baseline: screenshot-extracted resume asks one role follow-up and preserves text
  - baseline: resume optimization retrieves role-relevant snippets and pattern guidance
  - boundary: unrelated, JD, and offer screenshots do not enter excellent-resume save flow
  - ...


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 简历优化Judge引擎 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
