# Offer评估与对比系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 Offer评估与对比系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

中国 offer 评估模型、不完整 offer preliminary report、社保/税务/外包/奖金风险、快照持久化和 offer 对比。

## 项目事实

### 关键实现面
- `src/lib/offer-evaluation.ts`
- `src/lib/offer-persistence-verifier.ts`
- `src/app/api/offers/route.ts`
- `src/app/api/offer-reports/route.ts`
- `src/lib/agent/offer-session-state.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/offer-evaluation-model.test.ts`
- `src/__tests__/offer-flow.test.ts`
- `src/__tests__/offer-persistence-verified-write.test.ts`
- `src/__tests__/jd-image-routing.test.ts`
- `src/__tests__/agent-task-routing.test.ts`

### 从现有测试读到的行为
- offer-evaluation-model.test.ts 已覆盖 incomplete offer preliminary report、社保基数、外包/派遣、奖金确定性和已保存报告快照不随 offer 编辑变化。
- offer-persistence-verified-write.test.ts 已覆盖 Offer/report 写入后的 read-back verified write。
- jd-image-routing.test.ts 已覆盖 Offer 图片进入 Offer agent/tool，JD 文本加 Offer 图片要求澄清。

### 待补 eval 缺口
- 补多 Offer 对比排序和权重解释 eval。
- 补 Offer 截图 OCR 失败后的人工补录链路 eval。
- 补已保存 offer report 与 source offer stale 标记的 UI eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补多 Offer 对比排序和权重解释 eval

**为什么要补**: 这是当前 offer evaluation、offer persistence verifier、offer reports 和 offer flow 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/offer-evaluation-model.test.ts`、`src/__tests__/offer-flow.test.ts`、`src/__tests__/offer-persistence-verified-write.test.ts`、`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/agent-task-routing.test.ts`。
- fixture 必须包含：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId。
- 断言必须读取：offer report snapshot、risk model 输出、read-back proof 和 stale 标记。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 Offer 截图 OCR 失败后的人工补录链路 eval

**为什么要补**: 这是当前 offer evaluation、offer persistence verifier、offer reports 和 offer flow 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/offer-evaluation-model.test.ts`、`src/__tests__/offer-flow.test.ts`、`src/__tests__/offer-persistence-verified-write.test.ts`、`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/agent-task-routing.test.ts`。
- fixture 必须包含：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId。
- 断言必须读取：offer report snapshot、risk model 输出、read-back proof 和 stale 标记。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补已保存 offer report 与 source offer stale 标记的 UI eval

**为什么要补**: 这是当前 offer evaluation、offer persistence verifier、offer reports 和 offer flow 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/offer-evaluation-model.test.ts`、`src/__tests__/offer-flow.test.ts`、`src/__tests__/offer-persistence-verified-write.test.ts`、`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/agent-task-routing.test.ts`。
- fixture 必须包含：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId。
- 断言必须读取：offer report snapshot、risk model 输出、read-back proof 和 stale 标记。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 Offer评估与对比系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 不完整 offer 保存 preliminary report

**状态**: 已有自动化覆盖

**项目依据**:
- 这体现了产品判断：Offer 信息越不完整，用户越不能贸然做最终决定。
- - `src/__tests__/offer-evaluation-model.test.ts`：验证单 Offer 模型、信息缺失、社保基数、用工形式、奖金不确定等评分变化。 - `src/__tests__/offer-flow.test.ts`：验证 Offer intent 路由、工具集、单 Offer 与多 Offer 调用边界、谈判工具复用已保存...
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“不完整 offer 保存 preliminary report”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“不完整 offer 保存 preliminary report”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“不完整 offer 保存 preliminary report”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: keeps a saved report snapshot unchanged after the source offer is edited
- `src/__tests__/offer-flow.test.ts`: evaluate_offer returns layered output and keeps full report in rawData
- `src/__tests__/offer-flow.test.ts`: negotiation strategy consumes a saved report and does not call evaluate_offer

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 全额社保和最低基数社保输出不同风险

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - 30K * 12 和 30K * 15 的年现金差很多。 - 足额五险一金和最低基数缴纳差很多。 - 正式劳动关系和外包派遣风险不同。 - 年终奖“保证发”和“看绩效”不是同一件事。 - 一线城市高通勤和高生活成本会影响到手感受。 - 试用期过长、合同期限过短会影响稳定性。 - 业务边缘岗位和核心岗位的履历价值不同。
- - 社保/公积金按最低基数或低基数缴纳。 - 用工形式存在合规或稳定性风险。 - 试用期偏长。 - 合同期限偏短。 - 加班强度高。 - 年终或提成兑现不确定。 - 股权归属和行权安排不清。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“全额社保和最低基数社保输出不同风险”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“全额社保和最低基数社保输出不同风险”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“全额社保和最低基数社保输出不同风险”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 直签与外包/派遣输出不同雇佣风险

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - 30K * 12 和 30K * 15 的年现金差很多。 - 足额五险一金和最低基数缴纳差很多。 - 正式劳动关系和外包派遣风险不同。 - 年终奖“保证发”和“看绩效”不是同一件事。 - 一线城市高通勤和高生活成本会影响到手感受。 - 试用期过长、合同期限过短会影响稳定性。 - 业务边缘岗位和核心岗位的履历价值不同。
- - 税前月薪、薪数和年终奖合起来的现金包。 - 社保、公积金是足额缴纳还是最低基数。 - 用工主体是正式劳动关系、外包、派遣还是其他形式。 - 试用期和合同期限是否合理。 - 加班、通勤、城市生活成本是否影响实际收益。 - 奖金、股权、期权是否能兑现。 - 公司和岗位是否有成长价值。 - 这份 Offer 能不能谈，应该问 HR 什么。 - 如果同时有多个 ...
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“直签与外包/派遣输出不同雇佣风险”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“直签与外包/派遣输出不同雇佣风险”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“直签与外包/派遣输出不同雇佣风险”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. 保证奖金与浮动奖金风险不同

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - 30K * 12 和 30K * 15 的年现金差很多。 - 足额五险一金和最低基数缴纳差很多。 - 正式劳动关系和外包派遣风险不同。 - 年终奖“保证发”和“看绩效”不是同一件事。 - 一线城市高通勤和高生活成本会影响到手感受。 - 试用期过长、合同期限过短会影响稳定性。 - 业务边缘岗位和核心岗位的履历价值不同。
- 这三组信息把评估结果转成下一步行动：该问什么、该谈什么、什么风险不能忽略。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“保证奖金与浮动奖金风险不同”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“保证奖金与浮动奖金风险不同”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“保证奖金与浮动奖金风险不同”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 缺薪资/城市/合同主体时列 missing-info

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 税前月薪、薪数和年终奖合起来的现金包。 - 社保、公积金是足额缴纳还是最低基数。 - 用工主体是正式劳动关系、外包、派遣还是其他形式。 - 试用期和合同期限是否合理。 - 加班、通勤、城市生活成本是否影响实际收益。 - 奖金、股权、期权是否能兑现。 - 公司和岗位是否有成长价值。 - 这份 Offer 能不能谈，应该问 HR 什么。 - 如果同时有多个 ...
- - 城市/办公地点。 - 用工形式。 - 合同期限。 - 加班与补偿方式。 - 奖金兑现规则。 - 用工主体名称。 - 社保缴纳基数。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“缺薪资/城市/合同主体时列 missing-info”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“缺薪资/城市/合同主体时列 missing-info”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“缺薪资/城市/合同主体时列 missing-info”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. Offer 图片不走 JD evaluation

**状态**: 已有自动化覆盖

**项目依据**:
- 如果用户上传 Offer 截图，工具会调用 `/api/agent/image-intake`，并指定 `preferredDocumentType: "offer"`。如果截图无法提取有效 Offer 信息，会要求用户上传更清晰图片或粘贴文本。
- - 已保存的 `offerId`。 - 用户粘贴的 Offer 文本。 - Offer 截图识别结果。 - 页面表单里的结构化字段。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“Offer 图片不走 JD evaluation”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Offer 图片不走 JD evaluation”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Offer 图片不走 JD evaluation”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-flow.test.ts`: routes single-offer evaluation language to the Offer Agent
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 已保存报告快照不随 source offer 编辑变化

**状态**: 已有自动化覆盖

**项目依据**:
- `generate_offer_negotiation_strategy` 会读取已保存报告：
- `/api/offer-reports` 保存报告时会写入：
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“已保存报告快照不随 source offer 编辑变化”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“已保存报告快照不随 source offer 编辑变化”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“已保存报告快照不随 source offer 编辑变化”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: keeps a saved report snapshot unchanged after the source offer is edited
- `src/__tests__/offer-flow.test.ts`: Offer workspace source keeps report, stale badge, and Agent handoff boundaries

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. 跨用户 offer/report 不互读

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 纸鸢求职助手的 Offer 系统，不是一个“薪资计算器”。它要帮助用户在最终收口阶段判断：这份 Offer 值不值得接、还有哪些信息必须问 HR、哪些条款可以谈判、多个 Offer 应该如何取舍。
- 用户拿到 Offer 后，常见判断并不是“月薪多少”这么简单。真正需要判断的是：
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“跨用户 offer/report 不互读”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“跨用户 offer/report 不互读”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“跨用户 offer/report 不互读”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. minimum-base 社保风险低估

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这让系统不会因为“钱看起来高”就忽略合同、用工形式、社保或加班风险。
- - 社保/公积金按最低基数或低基数缴纳。 - 用工形式存在合规或稳定性风险。 - 试用期偏长。 - 合同期限偏短。 - 加班强度高。 - 年终或提成兑现不确定。 - 股权归属和行权安排不清。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“minimum-base 社保风险低估”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“minimum-base 社保风险低估”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“minimum-base 社保风险低估”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. outsourcing/dispatch 风险低估

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 30K * 12 和 30K * 15 的年现金差很多。 - 足额五险一金和最低基数缴纳差很多。 - 正式劳动关系和外包派遣风险不同。 - 年终奖“保证发”和“看绩效”不是同一件事。 - 一线城市高通勤和高生活成本会影响到手感受。 - 试用期过长、合同期限过短会影响稳定性。 - 业务边缘岗位和核心岗位的履历价值不同。
- 所以 Offer 系统不能只做一个薪资字段。它必须把现金、福利、合同、风险、成长和谈判空间放到同一张决策表里。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“outsourcing/dispatch 风险低估”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“outsourcing/dispatch 风险低估”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“outsourcing/dispatch 风险低估”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: changes tax risk output for full-salary vs minimum-base social insurance
- `src/__tests__/offer-evaluation-model.test.ts`: changes employment-risk output for direct hire vs outsourcing or dispatch

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. variable-only bonus 风险漏算

**状态**: 已有自动化覆盖

**项目依据**:
- - 30K * 12 和 30K * 15 的年现金差很多。 - 足额五险一金和最低基数缴纳差很多。 - 正式劳动关系和外包派遣风险不同。 - 年终奖“保证发”和“看绩效”不是同一件事。 - 一线城市高通勤和高生活成本会影响到手感受。 - 试用期过长、合同期限过短会影响稳定性。 - 业务边缘岗位和核心岗位的履历价值不同。
- 所以 Offer 系统不能只做一个薪资字段。它必须把现金、福利、合同、风险、成长和谈判空间放到同一张决策表里。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“variable-only bonus 风险漏算”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“variable-only bonus 风险漏算”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“variable-only bonus 风险漏算”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: treats variable-only bonus as uncertain unless guarantee wording exists

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. Offer 后未标 stale

**状态**: 已有自动化覆盖

**项目依据**:
- # 纸鸢求职助手 Offer 评估与对比系统的产品构造
- 纸鸢求职助手的 Offer 系统，不是一个“薪资计算器”。它要帮助用户在最终收口阶段判断：这份 Offer 值不值得接、还有哪些信息必须问 HR、哪些条款可以谈判、多个 Offer 应该如何取舍。
- 主要实现面：`src/lib/offer-evaluation.ts`、`src/lib/offer-persistence-verifier.ts`、`src/app/api/offers/route.ts`、`src/app/api/offer-reports/route.ts`。

**输入/fixture**:
- 正例：包含薪资、社保、合同主体、奖金、城市的 Offer 条款，用来验证“Offer 后未标 stale”的成功路径。
- 反例：缺关键字段、Offer 图片误入 JD、外包/派遣、最低基数社保、跨用户 report，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：offerId、reportId、missingInfo、risk labels、snapshot hash 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 offer evaluation、offer persistence verifier、offer reports 和 offer flow 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Offer 后未标 stale”对应动作，并记录请求、工具调用或页面状态。
3. 读取 offer report snapshot、risk model 输出、read-back proof 和 stale 标记，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Offer 后未标 stale”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Offer评估与对比系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/offer-evaluation-model.test.ts`: saves a preliminary report for incomplete offers and exposes missing-info items
- `src/__tests__/offer-evaluation-model.test.ts`: keeps a saved report snapshot unchanged after the source offer is edited
- `src/__tests__/offer-flow.test.ts`: routes single-offer evaluation language to the Offer Agent
- `src/__tests__/offer-flow.test.ts`: routes negotiation and HR-question language to the Offer Agent tool set

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/offer-evaluation-model.test.ts`
  - saves a preliminary report for incomplete offers and exposes missing-info items
  - changes tax risk output for full-salary vs minimum-base social insurance
  - changes employment-risk output for direct hire vs outsourcing or dispatch
  - treats variable-only bonus as uncertain unless guarantee wording exists
  - keeps a saved report snapshot unchanged after the source offer is edited
- `src/__tests__/offer-flow.test.ts`
  - routes single-offer evaluation language to the Offer Agent
  - routes negotiation and HR-question language to the Offer Agent tool set
  - allows explicit external research but blocks vague company questions in Offer mode
  - marks active offer reports stale when the user supplies material changes
  - evaluate_offer returns layered output and keeps full report in rawData
  - evaluate_offer accepts an Offer screenshot and extracts it before evaluating
  - compare_offers_deep rejects a single offer instead of silently evaluating it
  - compare_offers_deep does not compare when saved offer ids cannot both resolve
  - ...
- `src/__tests__/offer-persistence-verified-write.test.ts`
  - verifies an offer by reading it back before returning success
  - verifies an offer report and its linked offer latest_report_id before returning success
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
- `src/__tests__/agent-task-routing.test.ts`
  - does not route self-positioning guidance into profile write contracts
  - keeps explicit profile write intents under verified profile update contracts
  - keeps other durable task routing intact
  - routes clear job discovery requests to job_search with governed tools
  - asks one clarification for vague job discovery requests
  - does not confuse JD evaluation with job discovery
  - routes change-batch requests to job_search without creating a vague new scan route
  - routes current-resume read questions to a read-only resume query contract
  - ...


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- Offer评估与对比系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
