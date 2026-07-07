# 投递追踪系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 投递追踪系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

applications 数据、Tracker 列表/分组/看板、详情编辑、状态流转、导入导出和 Analytics/Home 共享口径。

## 项目事实

### 关键实现面
- `src/app/tracker/page.tsx`
- `src/lib/db.ts`
- `src/lib/parsers.ts`
- `src/lib/exporters.ts`
- `src/types/index.ts`
- `src/lib/data-repositories.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/data-isolation.test.ts`
- `src/__tests__/check-isolation.test.ts`

### 从现有测试读到的行为
- 投递追踪目前被数据隔离测试覆盖到 owner scope，但 UI 交互和状态枚举缺少专项 eval。
- Tracker 的状态会被首页、Analytics 和导出链路复用，口径漂移会造成多页面错误。
- Markdown 导入导出依赖 parsers/exporters，缺少 round-trip 证据。

### 待补 eval 缺口
- 补 tracker-ui.test.ts 覆盖列表、分组、看板和详情编辑。
- 补 tracker-status.test.ts 固定状态枚举与大小写兼容。
- 补 tracker-import-export.test.ts 固定 Markdown 备份恢复。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 tracker-ui.test.ts 覆盖列表、分组、看板和详情编辑

**为什么要补**: 这是当前 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts`。
- fixture 必须包含：applicationId、company、role、status、updatedAt、import source 和 export hash。
- 断言必须读取：applications scoped 查询、看板/分组状态、导入结果和导出内容。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 tracker-status.test.ts 固定状态枚举与大小写兼容

**为什么要补**: 这是当前 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts`。
- fixture 必须包含：applicationId、company、role、status、updatedAt、import source 和 export hash。
- 断言必须读取：applications scoped 查询、看板/分组状态、导入结果和导出内容。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 tracker-import-export.test.ts 固定 Markdown 备份恢复

**为什么要补**: 这是当前 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts`。
- fixture 必须包含：applicationId、company、role、status、updatedAt、import source 和 export hash。
- 断言必须读取：applications scoped 查询、看板/分组状态、导入结果和导出内容。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 投递追踪系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. applications 展示公司、岗位、状态、分数

**状态**: 已有自动化覆盖

**项目依据**:
- - 空数据状态是否正确。 - 搜索、状态筛选、排序是否基于同一批 `applications`。 - 状态标签是否覆盖 8 个标准状态。 - 从 `applied` 到 `interview` 是否能补面试轮次。 - 看板拖拽是否能更新状态。 - 导出内容是否包含公司、岗位、分数、状态、报告和备注。 - Analytics 是否能用这些状态计算漏斗。
- - 按公司和岗位去重或查找。 - 按状态过滤。 - 按日期排序。 - 按分数排序。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“applications 展示公司、岗位、状态、分数”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“applications 展示公司、岗位、状态、分数”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“applications 展示公司、岗位、状态、分数”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 状态流转覆盖 evaluated/applied/responded/interview/offer/discarded

**状态**: 已有自动化覆盖

**项目依据**:
- - 分数和基础信息。 - 当前状态和日期。 - 关联报告链接 `reportPath`。 - 备注。 - 面试轮次记录。 - 添加面试轮次按钮。 - 原始 JD 链接。 - 当状态为 offer 时，预留进入 Offer 对比的动作。
- 1. 页面主要使用浏览器本地 Dexie，不是完全服务端 repository。 2. `company + role` 去重主要发生在导入场景，页面内状态更新依赖 `id`。 3. 备注字段展示为只读，没有在详情面板里提供完整编辑器。 4. 面试记录能添加轮次和日期，但还没有和面试教练的训练记录完全联动。 5. “添加到 Offer 对比”按钮位置存在，但...
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“状态流转覆盖 evaluated/applied/responded/interview/offer/discarded”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“状态流转覆盖 evaluated/applied/responded/interview/offer/discarded”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“状态流转覆盖 evaluated/applied/responded/interview/offer/discarded”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B offers

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 列表/分组/看板三视图可读

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 分组视图按 `STATUS_ORDER` 把机会归类。
- 页面当前是 local-first 形态，直接读写浏览器里的 Dexie 数据库 `zhiyuan`。服务端仓储层里也有 `applications` 表和 `getDataRepositories().applications`，但这个页面没有完全迁到服务端 repository。文档里必须区分这一点，不能把它写成纯服务端多用户看板。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“列表/分组/看板三视图可读”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“列表/分组/看板三视图可读”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“列表/分组/看板三视图可读”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. 投递记录可导出 Markdown

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 页面支持“导出全部”和“导出已选”。这说明投递记录既是产品内数据，也可以被带出系统，继续用于外部复盘或备份。
- 投递追踪页使用 `src/lib/exporters.ts` 中的 `exportApplicationsMD()` 导出 Markdown 表格。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“投递记录可导出 Markdown”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“投递记录可导出 Markdown”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“投递记录可导出 Markdown”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. userA 不能看到 userB applications

**状态**: 已有自动化覆盖

**项目依据**:
- 如果只做一个投递清单，用户只能看到“投过哪些公司”。这对真实求职帮助有限。
- 页面当前是 local-first 形态，直接读写浏览器里的 Dexie 数据库 `zhiyuan`。服务端仓储层里也有 `applications` 表和 `getDataRepositories().applications`，但这个页面没有完全迁到服务端 repository。文档里必须区分这一点，不能把它写成纯服务端多用户看板。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“userA 不能看到 userB applications”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“userA 不能看到 userB applications”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“userA 不能看到 userB applications”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B offers

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. 默认视图不被 discarded 淹没

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 投递追踪页提供 list、grouped、kanban 三种视图。
- 分组视图按 `STATUS_ORDER` 把机会归类。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“默认视图不被 discarded 淹没”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“默认视图不被 discarded 淹没”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“默认视图不被 discarded 淹没”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. 取消编辑不写入

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这让投递追踪不只是表格编辑，而是一个机会详情页。用户可以从这里回到评估报告，也可以继续补充面试进展。
- 1. 页面主要使用浏览器本地 Dexie，不是完全服务端 repository。 2. `company + role` 去重主要发生在导入场景，页面内状态更新依赖 `id`。 3. 备注字段展示为只读，没有在详情面板里提供完整编辑器。 4. 面试记录能添加轮次和日期，但还没有和面试教练的训练记录完全联动。 5. “添加到 Offer 对比”按钮位置存在，但...
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“取消编辑不写入”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“取消编辑不写入”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“取消编辑不写入”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 错误 Markdown 导入不污染数据

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 页面主要使用浏览器本地 Dexie，不是完全服务端 repository。 2. `company + role` 去重主要发生在导入场景，页面内状态更新依赖 `id`。 3. 备注字段展示为只读，没有在详情面板里提供完整编辑器。 4. 面试记录能添加轮次和日期，但还没有和面试教练的训练记录完全联动。 5. “添加到 Offer 对比”按钮位置存在，但...
- 这个系统不是一个简单的表格。它把岗位、评分、报告、状态、面试轮次、备注、导出和 Analytics 漏斗连接起来，让用户的每一次求职动作都能沉淀成可复盘的数据。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“错误 Markdown 导入不污染数据”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“错误 Markdown 导入不污染数据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“错误 Markdown 导入不污染数据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 同公司同岗位重复导入

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这说明投递追踪不是只存“公司/岗位/状态”。它已经把面试推进所需的最小信息纳入了同一条记录。
- - 按公司和岗位去重或查找。 - 按状态过滤。 - 按日期排序。 - 按分数排序。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“同公司同岗位重复导入”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“同公司同岗位重复导入”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“同公司同岗位重复导入”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. 历史状态大小写导致统计丢失

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这套状态直接来自 `src/types/index.ts` 里的 `ApplicationStatus`。
- 这个系统不是一个简单的表格。它把岗位、评分、报告、状态、面试轮次、备注、导出和 Analytics 漏斗连接起来，让用户的每一次求职动作都能沉淀成可复盘的数据。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“历史状态大小写导致统计丢失”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“历史状态大小写导致统计丢失”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“历史状态大小写导致统计丢失”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 导出再导入字段丢失

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这个系统不是一个简单的表格。它把岗位、评分、报告、状态、面试轮次、备注、导出和 Analytics 漏斗连接起来，让用户的每一次求职动作都能沉淀成可复盘的数据。
- 投递追踪页使用 `src/lib/exporters.ts` 中的 `exportApplicationsMD()` 导出 Markdown 表格。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“导出再导入字段丢失”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“导出再导入字段丢失”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“导出再导入字段丢失”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. discarded 机会反复进入主列表

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 它把每个机会变成一条可持续推进的记录：评估结果进入追踪，投递状态持续变化，面试轮次被记录，报告可以回看，数据可以导出，Analytics 可以复盘。只要这套状态系统存在，用户的求职过程就不会散落在聊天、浏览器和脑子里。
- 投递追踪系统是纸鸢求职助手里的求职进度账本。JD 评估告诉用户“这个机会值不值得投”，投递追踪记录用户“有没有投、投到哪一步、下一步要做什么”。没有这个系统，评分报告、简历优化、面试准备和 Offer 比较都会停留在单次动作，无法形成长期求职闭环。
- 主要实现面：`src/app/tracker/page.tsx`、`src/lib/db.ts`、`src/lib/parsers.ts`、`src/lib/exporters.ts`。

**输入/fixture**:
- 正例：同一用户的 evaluated/applied/responded/interview/offer/discarded 记录，用来验证“discarded 机会反复进入主列表”的成功路径。
- 反例：跨用户记录、错误 Markdown、重复岗位、discarded 主列表污染，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：applicationId、company、role、status、updatedAt、import source 和 export hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 applications 数据层、投递追踪页面、状态流转和 Markdown 导入/导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“discarded 机会反复进入主列表”对应动作，并记录请求、工具调用或页面状态。
3. 读取 applications scoped 查询、看板/分组状态、导入结果和导出内容，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“discarded 机会反复进入主列表”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 投递追踪系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B applications
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B sessions
- `src/__tests__/data-isolation.test.ts`: user A cannot see user B profile

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/__tests__/data-isolation.test.ts`
  - user A cannot see user B applications
  - user A cannot see user B sessions
  - user A cannot see user B profile
  - user A cannot see user B offers
- `src/__tests__/check-isolation.test.ts`
  - passes when route has getCurrentUser
  - passes when route has scopedDb
  - flags route using private table without user_id or auth
  - ignores CREATE TABLE and ALTER TABLE statements
  - passes when route does not reference any private table


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 投递追踪系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
