# Analytics求职数据分析系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 Analytics求职数据分析系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

Analytics 页面漏斗、时间范围、本周摘要、健康灯、异常检测、AI 周报、health-check API 和 follow-up reminders。

## 项目事实

### 关键实现面
- `src/app/analytics/page.tsx`
- `src/app/api/analytics/weekly-report/route.ts`
- `src/app/api/analytics/health-check/route.ts`
- `src/lib/analytics.ts`
- `src/components/PipelineHealthPanel.tsx`

### 已落地或部分落地的 eval 资产
- `src/app/analytics/page.tsx`
- `src/lib/analytics.ts`

### 从现有测试读到的行为
- Analytics 的核心逻辑存在于页面和 lib/analytics.ts，但自动化测试覆盖明显不足。
- 漏斗指标依赖 applications 状态口径，应与 Tracker/Home 共享同一套语义。
- 周报和 health-check 是用户可见的解释性输出，必须避免确定性预测话术。

### 待补 eval 缺口
- 补 analytics-dashboard.test.ts 固定漏斗、趋势、空态、健康灯和异常检测。
- 补 analytics-weekly-report.test.ts 固定周报 API 输出结构。
- 补 health-check API 的风险分级 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 analytics-dashboard.test.ts 固定漏斗、趋势、空态、健康灯和异常检测

**为什么要补**: 这是当前 analytics page、analytics lib、weekly-report API 和 health-check API 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/app/analytics/page.tsx`、`src/lib/analytics.ts`。
- fixture 必须包含：timeRange、status counts、response denominator、weekly summary 和 health level。
- 断言必须读取：漏斗统计、趋势值、健康灯、周报 JSON 和页面空态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 analytics-weekly-report.test.ts 固定周报 API 输出结构

**为什么要补**: 这是当前 analytics page、analytics lib、weekly-report API 和 health-check API 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/app/analytics/page.tsx`、`src/lib/analytics.ts`。
- fixture 必须包含：timeRange、status counts、response denominator、weekly summary 和 health level。
- 断言必须读取：漏斗统计、趋势值、健康灯、周报 JSON 和页面空态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 health-check API 的风险分级 eval

**为什么要补**: 这是当前 analytics page、analytics lib、weekly-report API 和 health-check API 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/app/analytics/page.tsx`、`src/lib/analytics.ts`。
- fixture 必须包含：timeRange、status counts、response denominator、weekly summary 和 health level。
- 断言必须读取：漏斗统计、趋势值、健康灯、周报 JSON 和页面空态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 Analytics求职数据分析系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 按 applications 状态计算漏斗

**状态**: 待补自动化

**项目依据**:
- - `computeFunnel()` 是否按累计漏斗计算。 - `normalizeStatus()` 是否处理历史别名。 - `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。 - 空数据页面是否不展示假图表。 - 时间范围切换是否影响趋势图。 - 周报接口是否做登录和 API key 校验。 ...
- 这套状态决定了 Analytics 的计算口径。如果投递追踪里的状态混乱，Analytics 的图表就会失真。
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“按 applications 状态计算漏斗”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“按 applications 状态计算漏斗”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“按 applications 状态计算漏斗”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### B2. 时间范围切换 4w/8w/all

**状态**: 待补自动化

**项目依据**:
- - `computeFunnel()` 是否按累计漏斗计算。 - `normalizeStatus()` 是否处理历史别名。 - `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。 - 空数据页面是否不展示假图表。 - 时间范围切换是否影响趋势图。 - 周报接口是否做登录和 API key 校验。 ...
- 1. 页面数据主要来自本地 Dexie，不是服务端聚合。 2. followup 历史目前没有完整沉淀，提醒主要靠日期推断。 3. 拒绝模式分析是估算，不是从真实拒绝原因字段得出。 4. Offer 预测是启发式文案，不是统计模型。 5. 页面内健康灯和 `/api/analytics/health-check` 还没有统一成同一套诊断结果。 6. 时间计算...
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“时间范围切换 4w/8w/all”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“时间范围切换 4w/8w/all”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“时间范围切换 4w/8w/all”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### B3. 本周摘要计算新投递/面试/Offer

**状态**: 待补自动化

**项目依据**:
- 1. 调用 `getCurrentUser()` 做登录校验。 2. 调用 `checkApiKey()` 校验模型服务配置。 3. 计算本周非 skip/discarded 的申请数。 4. 计算通过筛选数：`responded`、`interview`、`offer`。 5. 调用 `callDeepSeekJson()` 要求模型返回结构化 JSON。...
- - evaluated - applied - responded - interview
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“本周摘要计算新投递/面试/Offer”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“本周摘要计算新投递/面试/Offer”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“本周摘要计算新投递/面试/Offer”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### B4. Pipeline 健康灯按回复率分档

**状态**: 待补自动化

**项目依据**:
- 这个健康灯不是严格统计模型，而是求职节奏提示。它让用户快速知道当前 pipeline 是否值得继续按原策略推进。
- - 基于 `applications` 的漏斗计算。 - 本周摘要和 4/8 周趋势。 - 基于节奏规则的跟进提醒。 - Pipeline 健康灯。 - 14 天无活动异常检测。 - 基于模型的 AI 周报接口。 - 基于模型的 health-check 接口。
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“Pipeline 健康灯按回复率分档”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Pipeline 健康灯按回复率分档”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Pipeline 健康灯按回复率分档”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. Analytics 不修改投递状态

**状态**: 待补自动化

**项目依据**:
- 在纸鸢里，Analytics 是投递追踪系统的上层解释层。投递追踪负责记录状态，Analytics 负责把状态变成判断。
- 这套状态决定了 Analytics 的计算口径。如果投递追踪里的状态混乱，Analytics 的图表就会失真。
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“Analytics 不修改投递状态”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Analytics 不修改投递状态”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Analytics 不修改投递状态”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 空数据进入空态

**状态**: 待补自动化

**项目依据**:
- 产品判断上，Analytics 不能在数据不足时强行输出确定结论。空数据和低置信度本身就是一种状态。
- - `computeFunnel()` 是否按累计漏斗计算。 - `normalizeStatus()` 是否处理历史别名。 - `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。 - 空数据页面是否不展示假图表。 - 时间范围切换是否影响趋势图。 - 周报接口是否做登录和 API key 校验。 ...
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“空数据进入空态”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“空数据进入空态”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“空数据进入空态”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. 周报失败不影响页面主分析

**状态**: 待补自动化

**项目依据**:
- 当前 Analytics 页面主要在前端内部计算健康灯，并没有把所有健康检查都委托给这个接口。这个接口更像是 server-side AI 诊断能力，适合未来接入 Agent 或后台周报。
- - `computeFunnel()` 是否按累计漏斗计算。 - `normalizeStatus()` 是否处理历史别名。 - `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。 - 空数据页面是否不展示假图表。 - 时间范围切换是否影响趋势图。 - 周报接口是否做登录和 API key 校验。 ...
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“周报失败不影响页面主分析”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“周报失败不影响页面主分析”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“周报失败不影响页面主分析”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 预测文案不声称确定 Offer 时间

**状态**: 待补自动化

**项目依据**:
- 1. 页面数据主要来自本地 Dexie，不是服务端聚合。 2. followup 历史目前没有完整沉淀，提醒主要靠日期推断。 3. 拒绝模式分析是估算，不是从真实拒绝原因字段得出。 4. Offer 预测是启发式文案，不是统计模型。 5. 页面内健康灯和 `/api/analytics/health-check` 还没有统一成同一套诊断结果。 6. 时间计算...
- Analytics 求职数据分析系统负责把用户的投递记录、评估结果、面试进展和 Offer 结果转成可行动的求职判断。它不是为了展示图表，而是为了回答用户真正关心的问题：我的求职漏斗健康吗？哪些机会该跟进？哪个阶段卡住了？下一周应该调整方向还是继续扩大投递？
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“预测文案不声称确定 Offer 时间”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“预测文案不声称确定 Offer 时间”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“预测文案不声称确定 Offer 时间”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 回复率分母用错

**状态**: 待补自动化

**项目依据**:
- 这种累计口径符合求职漏斗的含义：进入面试说明它已经经历过投递和回复阶段。
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“回复率分母用错”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“回复率分母用错”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“回复率分母用错”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. timeRange 切换复用旧数据

**状态**: 待补自动化

**项目依据**:
- - `computeFunnel()` 是否按累计漏斗计算。 - `normalizeStatus()` 是否处理历史别名。 - `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。 - 空数据页面是否不展示假图表。 - 时间范围切换是否影响趋势图。 - 周报接口是否做登录和 API key 校验。 ...
- Analytics 求职数据分析系统负责把用户的投递记录、评估结果、面试进展和 Offer 结果转成可行动的求职判断。它不是为了展示图表，而是为了回答用户真正关心的问题：我的求职漏斗健康吗？哪些机会该跟进？哪个阶段卡住了？下一周应该调整方向还是继续扩大投递？
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“timeRange 切换复用旧数据”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“timeRange 切换复用旧数据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“timeRange 切换复用旧数据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 拒绝状态统计 active 机会

**状态**: 待补自动化

**项目依据**:
- 计算方式不是简单统计某个状态出现几次，而是“到达某阶段及以后”的累计口径：
- 例如一个状态为 `interview` 的机会，会被计入：
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“拒绝状态统计 active 机会”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“拒绝状态统计 active 机会”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“拒绝状态统计 active 机会”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. previous=0 显示假下降

**状态**: 待补自动化

**项目依据**:
- - `computeFunnel()` 是否按累计漏斗计算。 - `normalizeStatus()` 是否处理历史别名。 - `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。 - 空数据页面是否不展示假图表。 - 时间范围切换是否影响趋势图。 - 周报接口是否做登录和 API key 校验。 ...
- 它不是为了让页面看起来更丰富，而是为了让用户知道：机会池是否健康、哪一批申请该跟进、哪些阶段转化差、本周节奏是否下降、下一步要扩大投递还是优化简历。它的基础是投递追踪系统里的状态数据；它的输出是用户下一步行动的判断依据。
- 主要实现面：`src/app/analytics/page.tsx`、`src/app/api/analytics/weekly-report/route.ts`、`src/app/api/analytics/health-check/route.ts`、`src/lib/analytics.ts`。

**输入/fixture**:
- 正例：同一用户不同时间范围内的投递、回复、面试、Offer 数据，用来验证“previous=0 显示假下降”的成功路径。
- 反例：空数据、周报失败、previous=0、拒绝状态、确定性预测话术，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：timeRange、status counts、response denominator、weekly summary 和 health level；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 analytics page、analytics lib、weekly-report API 和 health-check API 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“previous=0 显示假下降”对应动作，并记录请求、工具调用或页面状态。
3. 读取 漏斗统计、趋势值、健康灯、周报 JSON 和页面空态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“previous=0 显示假下降”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Analytics求职数据分析系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- 暂无直接测试命中；新增测试应放在本节建议落点或同域 `src/__tests__/` 文件中。

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/app/analytics/page.tsx`
- `src/lib/analytics.ts`


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- Analytics求职数据分析系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
