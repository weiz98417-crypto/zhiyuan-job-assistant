# 首页求职工作台 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 首页求职工作台 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

首页从 applications、reports、offers、interviews 草稿和新闻模块组合每日求职指标、漏斗、待办、快速入口和状态提醒。

## 项目事实

### 关键实现面
- `src/app/page.tsx`
- `src/components/home/HeroMetrics.tsx`
- `src/components/home/PipelineFunnel.tsx`
- `src/components/home/TodoReminders.tsx`
- `src/components/home/MiniPipeline.tsx`
- `src/components/home/IndustryNews.tsx`
- `src/components/home/CompanyNews.tsx`

### 已落地或部分落地的 eval 资产
- `src/__tests__/news-routes.test.ts`

### 从现有测试读到的行为
- 首页实现按 applications/reports/offers 组合指标，但现有自动化主要只覆盖新闻路由。
- TodoReminders、MiniPipeline、PipelineFunnel 是首页的用户可见风险点，目前缺少组件级固定样例。
- CompanyNews 依赖目标公司配置，缺少目标时应引导到 settings，而不是静默空白。

### 待补 eval 缺口
- 补 homepage-dashboard.test.ts 固定指标口径、空态、错误态和待办规则。
- 补 CompanyNews hasTargets=false 跳转 settings 的页面 eval。
- 补首页快速入口不直接写业务状态的静态交互 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 homepage-dashboard.test.ts 固定指标口径、空态、错误态和待办规则

**为什么要补**: 这是当前 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/news-routes.test.ts`。
- fixture 必须包含：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI。
- 断言必须读取：页面指标、API JSON、local fixture applications/reports/offers。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 CompanyNews hasTargets=false 跳转 settings 的页面 eval

**为什么要补**: 这是当前 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/news-routes.test.ts`。
- fixture 必须包含：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI。
- 断言必须读取：页面指标、API JSON、local fixture applications/reports/offers。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补首页快速入口不直接写业务状态的静态交互 eval

**为什么要补**: 这是当前 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/news-routes.test.ts`。
- fixture 必须包含：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI。
- 断言必须读取：页面指标、API JSON、local fixture applications/reports/offers。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 首页求职工作台 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 并行读取 applications/reports/offers 并生成核心指标

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 首页的核心指标由 `src/app/page.tsx` 计算。
- - 新闻放在前面，是为了让用户先看到外部机会环境。 - 核心指标紧跟其后，恢复当前求职进度。 - 漏斗和待办把“状态”转成“动作”。 - 快速操作在下面承接下一步路径。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“并行读取 applications/reports/offers 并生成核心指标”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“并行读取 applications/reports/offers 并生成核心指标”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“并行读取 applications/reports/offers 并生成核心指标”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. 已评估数量取 reportCount 与 evaluated applications 的最大值

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 这个口径很关键。用户可能有报告，但 application 状态没有完全同步；也可能 tracker 里有 evaluated 状态但报告接口数量更少。首页取两者最大值，避免低估评估数量。
- - “已发现”和“已评估”漏斗口径相同，还没有独立接入职位发现扫描库。 - 面试日程仍从本地 Dexie 读取，和服务端投递记录没有完全统一。 - 待办只覆盖三类规则，没有覆盖 Offer 截止时间、简历提案待确认、JD 报告待导出等更细动作。 - 周趋势只看数量差，不解释质量变化。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“已评估数量取 reportCount 与 evaluated applications 的最大值”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“已评估数量取 reportCount 与 evaluated applications 的最大值”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“已评估数量取 reportCount 与 evaluated applications 的最大值”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. Offer 指标优先读取 /api/offers

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- Offer 优先使用 `/api/offers` 的数量。如果 Offer 接口没有记录，则退回统计 applications 中 `status = offer` 的数量。
- - `/api/data/applications`、`/api/data/reports`、`/api/offers` 成功时指标口径正确。 - 服务端接口失败时进入 ErrorState。 - 没有数据时指标显示 `—`，不显示假统计。 - 面试 7 天内、面试后 3 天未跟进、评估后 7 天未投递能生成待办。 - 目标公司未设置时，目标企业动态能引导到...
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“Offer 指标优先读取 /api/offers”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Offer 指标优先读取 /api/offers”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Offer 指标优先读取 /api/offers”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. TodoReminders 生成 followup/interview/apply 三类待办

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - “已发现”和“已评估”漏斗口径相同，还没有独立接入职位发现扫描库。 - 面试日程仍从本地 Dexie 读取，和服务端投递记录没有完全统一。 - 待办只覆盖三类规则，没有覆盖 Offer 截止时间、简历提案待确认、JD 报告待导出等更细动作。 - 周趋势只看数量差，不解释质量变化。
- - `/api/data/applications`、`/api/data/reports`、`/api/offers` 成功时指标口径正确。 - 服务端接口失败时进入 ErrorState。 - 没有数据时指标显示 `—`，不显示假统计。 - 面试 7 天内、面试后 3 天未跟进、评估后 7 天未投递能生成待办。 - 目标公司未设置时，目标企业动态能引导到...
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“TodoReminders 生成 followup/interview/apply 三类待办”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“TodoReminders 生成 followup/interview/apply 三类待办”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“TodoReminders 生成 followup/interview/apply 三类待办”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 核心数据接口失败进入 ErrorState

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - `/api/data/applications`、`/api/data/reports`、`/api/offers` 成功时指标口径正确。 - 服务端接口失败时进入 ErrorState。 - 没有数据时指标显示 `—`，不显示假统计。 - 面试 7 天内、面试后 3 天未跟进、评估后 7 天未投递能生成待办。 - 目标公司未设置时，目标企业动态能引导到...
- - 初次加载显示 skeleton。 - 接口失败显示“快讯暂不可用”。 - 数据为空也显示“快讯暂不可用”。 - 有数据时最多展示 6 条。 - 有 URL 的新闻用新窗口打开，并显示来源和相对时间。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“核心数据接口失败进入 ErrorState”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“核心数据接口失败进入 ErrorState”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“核心数据接口失败进入 ErrorState”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 无求职数据时显示空态和可行动入口

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 初次加载显示 skeleton。 - 接口失败显示“快讯暂不可用”。 - 数据为空也显示“快讯暂不可用”。 - 有数据时最多展示 6 条。 - 有 URL 的新闻用新窗口打开，并显示来源和相对时间。
- 这类动态信息不参与核心求职数据计算，失败时不应该影响首页主数据。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“无求职数据时显示空态和可行动入口”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“无求职数据时显示空态和可行动入口”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“无求职数据时显示空态和可行动入口”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. 新闻失败不影响核心指标

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 新闻放在前面，是为了让用户先看到外部机会环境。 - 核心指标紧跟其后，恢复当前求职进度。 - 漏斗和待办把“状态”转成“动作”。 - 快速操作在下面承接下一步路径。
- 首页的核心指标由 `src/app/page.tsx` 计算。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“新闻失败不影响核心指标”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“新闻失败不影响核心指标”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“新闻失败不影响核心指标”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 快速操作只跳转不写入业务状态

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 新闻放在前面，是为了让用户先看到外部机会环境。 - 核心指标紧跟其后，恢复当前求职进度。 - 漏斗和待办把“状态”转成“动作”。 - 快速操作在下面承接下一步路径。
- 1. 时间问候和标题。 2. 行业快讯、目标企业动态。 3. 核心求职指标。 4. 转化漏斗和待办提醒。 5. 非空时展示管线总览。 6. 快速操作入口。 7. 每日鼓励语。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“快速操作只跳转不写入业务状态”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“快速操作只跳转不写入业务状态”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“快速操作只跳转不写入业务状态”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. reports 多于 evaluated applications 时不能低估已评估数

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这个口径很关键。用户可能有报告，但 application 状态没有完全同步；也可能 tracker 里有 evaluated 状态但报告接口数量更少。首页取两者最大值，避免低估评估数量。
- 趋势不是绩效评判，而是节奏提醒。比如已评估增加但已投递没有变化，就说明用户可能评估了很多岗位但没有转化成投递。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“reports 多于 evaluated applications 时不能低估已评估数”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“reports 多于 evaluated applications 时不能低估已评估数”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“reports 多于 evaluated applications 时不能低估已评估数”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. 平均匹配分无有效分时不能显示 0

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 平均匹配分只统计 `score > 0` 的 applications。没有有效分数时展示 `—`，不显示 0 分。
- 首页不是把所有模块平均铺开，而是先让用户看状态，再引导行动。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“平均匹配分无有效分时不能显示 0”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“平均匹配分无有效分时不能显示 0”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“平均匹配分无有效分时不能显示 0”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. previous week 为 0 时不显示假趋势

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - previous 不存在或为 0 时，不显示趋势。 - 正数显示上升。 - 负数显示下降。 - 0 显示持平。
- - `/api/data/applications`、`/api/data/reports`、`/api/offers` 成功时指标口径正确。 - 服务端接口失败时进入 ErrorState。 - 没有数据时指标显示 `—`，不显示假统计。 - 面试 7 天内、面试后 3 天未跟进、评估后 7 天未投递能生成待办。 - 目标公司未设置时，目标企业动态能引导到...
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“previous week 为 0 时不显示假趋势”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“previous week 为 0 时不显示假趋势”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“previous week 为 0 时不显示假趋势”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. 面试 7 天内待办不能被 followup 规则覆盖

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - `applied` - `responded` - `interview` - `offer`
- - “已发现”和“已评估”漏斗口径相同，还没有独立接入职位发现扫描库。 - 面试日程仍从本地 Dexie 读取，和服务端投递记录没有完全统一。 - 待办只覆盖三类规则，没有覆盖 Offer 截止时间、简历提案待确认、JD 报告待导出等更细动作。 - 周趋势只看数量差，不解释质量变化。
- 主要实现面：`src/app/page.tsx`、`src/components/home/HeroMetrics.tsx`、`src/components/home/PipelineFunnel.tsx`、`src/components/home/TodoReminders.tsx`。

**输入/fixture**:
- 正例：同一用户下的已评估岗位、投递记录、Offer、面试时间和 follow-up 时间，用来验证“面试 7 天内待办不能被 followup 规则覆盖”的成功路径。
- 反例：核心接口失败、空数据、新闻接口失败、previous week 为 0，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：接口响应、统计字段、待办类型、趋势分母和空态/错误态 UI；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 首页工作台页面、applications/reports/offers 数据读取和 TodoReminders 规则 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“面试 7 天内待办不能被 followup 规则覆盖”对应动作，并记录请求、工具调用或页面状态。
3. 读取 页面指标、API JSON、local fixture applications/reports/offers，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“面试 7 天内待办不能被 followup 规则覆盖”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 首页求职工作台 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/news-routes.test.ts`: serves industry news from the selected data repository cache
- `src/__tests__/news-routes.test.ts`: falls back to raw RSS titles when industry summarization returns no items
- `src/__tests__/news-routes.test.ts`: serves company news for the current user

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/__tests__/news-routes.test.ts`
  - serves industry news from the selected data repository cache
  - falls back to raw RSS titles when industry summarization returns no items
  - serves company news for the current user


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 首页求职工作台 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
