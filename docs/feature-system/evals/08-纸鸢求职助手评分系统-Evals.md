# 纸鸢求职助手评分系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 纸鸢求职助手评分系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

JD 文本、URL、截图输入，A-G 报告结构，A-F 评分，G 风险扫描，报告/JD 持久化和 partial write 检查。

## 项目事实

### 关键实现面
- `src/lib/evaluation-scoring.ts`
- `src/lib/judge-engine.ts`
- `src/lib/report-normalize.ts`
- `src/app/api/evaluate/route.ts`
- `src/app/api/agent/persist-eval/route.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/evaluation-scoring.test.ts`
- `src/__tests__/persist-eval-jd-verified-write.test.ts`
- `src/__tests__/jd-image-routing.test.ts`
- `src/__tests__/jd-evaluation-summary.test.ts`
- `src/__tests__/jd-eval-partial-candidate.test.ts`
- `scripts/check-jd-eval-partials.mjs`
- `test/snapshots/*.txt`

### 从现有测试读到的行为
- evaluation-scoring.test.ts 已固定 A-F 评分和 G 合规风险分离，避免完整策略块因提到缺口被误打低分。
- persist-eval-jd-verified-write.test.ts 已覆盖 JD 写入后 read-back、PostgreSQL jsonb 语义匹配和失败 rollback。
- jd-eval-partial-candidate.test.ts 与 check-jd-eval-partials.mjs 用于发现局部写入和候选 eval。

### 待补 eval 缺口
- 补 5 个真实 JD 风险快照到自动评分断言的 eval。
- 补 URL 抓取失败后的用户补文本链路 eval。
- 补报告库和 JD 库跨页面绑定 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 5 个真实 JD 风险快照到自动评分断言的 eval

**为什么要补**: 这是当前 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/evaluation-scoring.test.ts`、`src/__tests__/persist-eval-jd-verified-write.test.ts`、`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/jd-evaluation-summary.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts`。
- fixture 必须包含：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON。
- 断言必须读取：A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 URL 抓取失败后的用户补文本链路 eval

**为什么要补**: 这是当前 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/evaluation-scoring.test.ts`、`src/__tests__/persist-eval-jd-verified-write.test.ts`、`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/jd-evaluation-summary.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts`。
- fixture 必须包含：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON。
- 断言必须读取：A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补报告库和 JD 库跨页面绑定 eval

**为什么要补**: 这是当前 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/evaluation-scoring.test.ts`、`src/__tests__/persist-eval-jd-verified-write.test.ts`、`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/jd-evaluation-summary.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts`。
- fixture 必须包含：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON。
- 断言必须读取：A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 纸鸢求职助手评分系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. JD 报告包含 A-G 结构

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 在这个项目里，评分系统覆盖的是完整的 JD 评估链路：输入可以是 JD 文本、JD 链接、JD 截图，也可以来自 Agent 对话里刚识别出的岗位内容；系统会先统一得到 JD 正文，再识别岗位类型，读取用户简历和长期记忆，生成 A-G 七个板块，抽取分项分数，计算 A-F 总分，把 G 职位真实性和黑话风险单独展示，最后把报告、JD、投递记录和必要记忆写入数...
- Agent 工具 `evaluate_jd_full` 的 `formatResult` 明确要求：评估完成后，只给用户一个聊天摘要，不输出完整 A-G 报告正文，不输出大表格。完整内容保存到报告库或 JD 管理，用户可以打开详情，也可以下载 PDF。
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“JD 报告包含 A-G 结构”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD 报告包含 A-G 结构”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD 报告包含 A-G 结构”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. E/F 完整策略不因提到缺口被误打低分

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - 把所有判断都混成一个模糊匹配分，用户看不出行动路径。 - 看到风险词就粗暴扣分，导致完整的定制化方案、面试准备、职级策略被误判成低质量内容。
- 项目里曾经出现过“定制化方案、面试准备、职级与策略、简历匹配都只有 1 分”的问题。后来排查发现，E/F/C 板块内容本身并不差，问题在旧评分规则把“缺口、未明确、红线问题、风险”等词当成低分证据。但在求职报告里，这些词经常恰恰是高质量策略内容的一部分。比如：
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“E/F 完整策略不因提到缺口被误打低分”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“E/F 完整策略不因提到缺口被误打低分”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“E/F 完整策略不因提到缺口被误打低分”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 报告和 JD 写入后必须读回

**状态**: 已有自动化覆盖

**项目依据**:
- - report 是否按预期写入。 - JD 是否按预期写入。 - JSON 内容是否语义一致。 - PostgreSQL 模式下如果读回失败，要回滚事务。
- 它不是一个“AI 打分器”，而是一套求职决策系统。它用 A-G 板块把问题拆清楚，用 A-F 权重把机会优先级算出来，用 G 和黑话扫描把风险独立展示，用报告库和 JD 库把判断沉淀下来，用读回校验证明系统真的完成了保存。
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“报告和 JD 写入后必须读回”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“报告和 JD 写入后必须读回”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“报告和 JD 写入后必须读回”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/persist-eval-jd-verified-write.test.ts`: accepts PostgreSQL jsonb read-back values as semantic JSON matches
- `src/__tests__/persist-eval-jd-verified-write.test.ts`: rolls back the PostgreSQL transaction when JD read-back verification fails

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 聊天摘要使用 A-G 板块而非完整报告

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- Agent 工具 `evaluate_jd_full` 的 `formatResult` 明确要求：评估完成后，只给用户一个聊天摘要，不输出完整 A-G 报告正文，不输出大表格。完整内容保存到报告库或 JD 管理，用户可以打开详情，也可以下载 PDF。
- 在这个项目里，评分系统覆盖的是完整的 JD 评估链路：输入可以是 JD 文本、JD 链接、JD 截图，也可以来自 Agent 对话里刚识别出的岗位内容；系统会先统一得到 JD 正文，再识别岗位类型，读取用户简历和长期记忆，生成 A-G 七个板块，抽取分项分数，计算 A-F 总分，把 G 职位真实性和黑话风险单独展示，最后把报告、JD、投递记录和必要记忆写入数...
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“聊天摘要使用 A-G 板块而非完整报告”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“聊天摘要使用 A-G 板块而非完整报告”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“聊天摘要使用 A-G 板块而非完整报告”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. G 风险不进入 A-F 总分

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- ### 12.5 黑话风险为什么不进入 A-F 总分
- G 板块不进入 A-F 总分。它单独回答：这个岗位是否真实可靠，投之前要小心什么。
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“G 风险不进入 A-F 总分”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“G 风险不进入 A-F 总分”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“G 风险不进入 A-F 总分”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. OCR/URL 正文失败不生成假报告

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这也是之前截图识别卡住、最终提示“未能从截图中提取到有效 JD 文本”的原因之一：系统已经能识别图片意图是 JD，但后续 OCR 正文质量校验没有拿到可用于评估的完整 JD 正文。产品上这一步必须严格，否则会把聊天界面、缩略图、失败提示当成岗位正文，生成错误报告。
- 招聘网站可能限制访问。URL 抓取失败时，系统提示粘贴文本，不继续生成假报告。
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“OCR/URL 正文失败不生成假报告”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“OCR/URL 正文失败不生成假报告”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“OCR/URL 正文失败不生成假报告”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. JD read-back 失败 rollback

**状态**: 已有自动化覆盖

**项目依据**:
- - report 是否按预期写入。 - JD 是否按预期写入。 - JSON 内容是否语义一致。 - PostgreSQL 模式下如果读回失败，要回滚事务。
- 相关测试在 `src/__tests__/persist-eval-jd-verified-write.test.ts`，覆盖了 SQLite 读回、PostgreSQL jsonb 语义读回、JD 读回失败时事务回滚等场景。
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“JD read-back 失败 rollback”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD read-back 失败 rollback”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD read-back 失败 rollback”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/persist-eval-jd-verified-write.test.ts`: accepts PostgreSQL jsonb read-back values as semantic JSON matches
- `src/__tests__/persist-eval-jd-verified-write.test.ts`: rolls back the PostgreSQL transaction when JD read-back verification fails

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. 跨用户 report/JD 不互读

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 纸鸢求职助手的评分系统，不是一个“把 JD 丢给大模型，然后返回几分”的小功能。它是用户看到一个岗位之后，判断要不要投、怎么投、怎么改简历、怎么准备面试、这个岗位有没有坑的核心判断层。
- 在这个项目里，评分系统覆盖的是完整的 JD 评估链路：输入可以是 JD 文本、JD 链接、JD 截图，也可以来自 Agent 对话里刚识别出的岗位内容；系统会先统一得到 JD 正文，再识别岗位类型，读取用户简历和长期记忆，生成 A-G 七个板块，抽取分项分数，计算 A-F 总分，把 G 职位真实性和黑话风险单独展示，最后把报告、JD、投递记录和必要记忆写入数...
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“跨用户 report/JD 不互读”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“跨用户 report/JD 不互读”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“跨用户 report/JD 不互读”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 摘要变成简历修改表格

**状态**: 已有自动化覆盖

**项目依据**:
- 这对应用户之前遇到的“不能把没验证成功的东西说成已保存”的问题。对于求职产品来说，报告和简历修改是用户会依赖的资产。如果写入失败还提示成功，后续所有动作都会建立在错误状态上。
- - 先读取显式评分、总分、得分、分数、匹配度、推荐度等表达。 - B 板块用正向、部分、负向匹配信号计算比例分。 - C/E/F 板块识别表格、策略、话术、行动、STAR、职级等具体方案信号。 - G 板块识别“高可信度、谨慎推进、疑似虚假”等定性等级。 - 如果内容短且表达“无法评估、未提供简历、缺少 JD”，才按不可用处理。
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“摘要变成简历修改表格”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“摘要变成简历修改表格”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“摘要变成简历修改表格”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot enters preview confirmation flow
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot plus excellent-resume save intent calls the reference save tool
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot save intent without explicit role does not directly save

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. C 板块被 B 缺简历拖低

**状态**: 已有自动化覆盖

**项目依据**:
- 在这个项目里，评分系统覆盖的是完整的 JD 评估链路：输入可以是 JD 文本、JD 链接、JD 截图，也可以来自 Agent 对话里刚识别出的岗位内容；系统会先统一得到 JD 正文，再识别岗位类型，读取用户简历和长期记忆，生成 A-G 七个板块，抽取分项分数，计算 A-F 总分，把 G 职位真实性和黑话风险单独展示，最后把报告、JD、投递记录和必要记忆写入数...
- 项目里曾经出现过“定制化方案、面试准备、职级与策略、简历匹配都只有 1 分”的问题。后来排查发现，E/F/C 板块内容本身并不差，问题在旧评分规则把“缺口、未明确、红线问题、风险”等词当成低分证据。但在求职报告里，这些词经常恰恰是高质量策略内容的一部分。比如：
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“C 板块被 B 缺简历拖低”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“C 板块被 B 缺简历拖低”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“C 板块被 B 缺简历拖低”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot enters preview confirmation flow
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot plus excellent-resume save intent calls the reference save tool
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot save intent without explicit role does not directly save

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. JD 图片跳过 image intake

**状态**: 已有自动化覆盖

**项目依据**:
- 如果图片不像 JD，或者 image intake 置信度低，系统不能硬跑评估。`jd-image-routing.test.ts` 覆盖了这些场景：未知截图不进入 JD/Offer/resume 流程，低置信度缩略图提示上传更清晰图片，OCR 超时被当成临时服务失败，而不是直接指责图片不清楚。
- 第二个入口是 Agent 工具 `evaluate_jd_full`，对应 `src/lib/agent/tools/action/evaluate-jd-full.ts`。用户在 Agent Chat 里说“评估这个 JD”“看看这个职位”“帮我看这张 JD 截图”，Agent 会调用这个工具。工具会处理对话输入、图片识别、最近 JD 回退、长期记忆上下文...
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“JD 图片跳过 image intake”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD 图片跳过 image intake”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD 图片跳过 image intake”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 局部候选内容污染 JD 评估摘要

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- Agent 工具 `evaluate_jd_full` 的 `formatResult` 明确要求：评估完成后，只给用户一个聊天摘要，不输出完整 A-G 报告正文，不输出大表格。完整内容保存到报告库或 JD 管理，用户可以打开详情，也可以下载 PDF。
- 在这个项目里，评分系统覆盖的是完整的 JD 评估链路：输入可以是 JD 文本、JD 链接、JD 截图，也可以来自 Agent 对话里刚识别出的岗位内容；系统会先统一得到 JD 正文，再识别岗位类型，读取用户简历和长期记忆，生成 A-G 七个板块，抽取分项分数，计算 A-F 总分，把 G 职位真实性和黑话风险单独展示，最后把报告、JD、投递记录和必要记忆写入数...
- 主要实现面：`src/lib/evaluation-scoring.ts`、`src/lib/judge-engine.ts`、`src/lib/report-normalize.ts`、`src/app/api/evaluate/route.ts`。

**输入/fixture**:
- 正例：一份真实 JD 文本或截图、用户简历/画像、A-G 报告和保存请求，用来验证“局部候选内容污染 JD 评估摘要”的成功路径。
- 反例：URL/OCR 正文失败、缺简历、G 风险词、JD read-back mismatch、跨用户读，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：source、reportId、jdId、block scores、risk section、transaction state 和 read-back JSON；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 evaluate stream、evaluate_jd_full、evaluation-scoring、persist-eval 和 JD/image 路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“局部候选内容污染 JD 评估摘要”对应动作，并记录请求、工具调用或页面状态。
3. 读取 A-G 板块、A-F 加权分、G 独立风险、reports/jds 读回和 rollback 记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“局部候选内容污染 JD 评估摘要”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 纸鸢求职助手评分系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/evaluation-scoring.test.ts`: does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
- `src/__tests__/evaluation-scoring.test.ts`: scores legitimacy separately and excludes block G from the weighted overall score
- `src/__tests__/evaluation-scoring.test.ts`: keeps missing-resume CV matching low without poisoning strategy blocks

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/__tests__/evaluation-scoring.test.ts`
  - does not collapse complete customization and interview-prep blocks to 1 because they mention gaps
  - scores legitimacy separately and excludes block G from the weighted overall score
  - keeps missing-resume CV matching low without poisoning strategy blocks
- `src/__tests__/persist-eval-jd-verified-write.test.ts`
  - verifies the saved JD by reading it back before returning success
  - accepts PostgreSQL jsonb read-back values as semantic JSON matches
  - rolls back the PostgreSQL transaction when JD read-back verification fails
- `src/__tests__/jd-image-routing.test.ts`
  - routes recognized JD images to the JD evaluation agent and tool
  - routes recognized Offer images to the Offer agent and tool
  - does not blindly evaluate unknown screenshots
  - does not bypass image recognition for JD image turns when intake is unavailable
  - does not bypass image recognition for Offer image turns when intake is unavailable
  - image-only input classifies before generic chat and asks user intent
  - JD text plus JD image routes to JD evaluation
  - Offer text plus Offer image routes to Offer evaluation
  - ...
- `src/__tests__/jd-evaluation-summary.test.ts`
  - uses risk-bearing A-G blocks instead of resume advice table lines
- `src/__tests__/jd-eval-partial-candidate.test.ts`
  - turns orphan JD reports into redacted partial_write eval candidates
  - upserts candidates into the agent eval queue
- `scripts/check-jd-eval-partials.mjs`
- `test/snapshots/*.txt`


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 纸鸢求职助手评分系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
