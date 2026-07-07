# 岗位发现扫描系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 岗位发现扫描系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

Discover 页面、scan_queue、scan_jobs、scan worker、portals 配置、国内岗位过滤、岗位状态和 JD 保存承接。

## 项目事实

### 关键实现面
- `src/app/discover/page.tsx`
- `src/app/api/scan/route.ts`
- `src/app/api/scan/jobs/route.ts`
- `src/app/api/scan/jobs/[id]/jd/route.ts`
- `src/lib/scan-data.ts`
- `src/lib/job-discovery.ts`
- `scripts/scan-worker.mjs`
- `portals.yml`

### 已落地或部分落地的 eval 资产
- `src/__tests__/discovery-ui.test.ts`
- `src/__tests__/discovery-save-api.test.ts`
- `src/__tests__/scan-domestic-filter.test.ts`
- `src/__tests__/scan-jobs-api.test.ts`
- `src/__tests__/job-discovery-dedup.test.ts`
- `src/__tests__/job-discovery-fingerprint.test.ts`

### 从现有测试读到的行为
- scan-domestic-filter.test.ts 已固定海外/remote 海外岗位过滤，未知地点和国内岗位保留。
- job-discovery-fingerprint.test.ts 与 job-discovery-dedup.test.ts 已覆盖 URL 规范化和岗位去重。
- scan-jobs-api.test.ts 已覆盖岗位发现结果 API 的 scanId/status 语义。

### 待补 eval 缺口
- 补 scan_queue 创建和 worker 写入的 API eval。
- 补 active scan/status 轮询 eval。
- 补 weak duplicate 提示但不阻断入库的 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 scan_queue 创建和 worker 写入的 API eval

**为什么要补**: 这是当前 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/discovery-ui.test.ts`、`src/__tests__/discovery-save-api.test.ts`、`src/__tests__/scan-domestic-filter.test.ts`、`src/__tests__/scan-jobs-api.test.ts`、`src/__tests__/job-discovery-dedup.test.ts`。
- fixture 必须包含：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId。
- 断言必须读取：scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 active scan/status 轮询 eval

**为什么要补**: 这是当前 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/discovery-ui.test.ts`、`src/__tests__/discovery-save-api.test.ts`、`src/__tests__/scan-domestic-filter.test.ts`、`src/__tests__/scan-jobs-api.test.ts`、`src/__tests__/job-discovery-dedup.test.ts`。
- fixture 必须包含：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId。
- 断言必须读取：scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 weak duplicate 提示但不阻断入库的 eval

**为什么要补**: 这是当前 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/discovery-ui.test.ts`、`src/__tests__/discovery-save-api.test.ts`、`src/__tests__/scan-domestic-filter.test.ts`、`src/__tests__/scan-jobs-api.test.ts`、`src/__tests__/job-discovery-dedup.test.ts`。
- fixture 必须包含：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId。
- 断言必须读取：scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 岗位发现扫描系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. Discover 默认面向国内 AI/产品岗位

**状态**: 已有自动化覆盖

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- 这体现了纸鸢项目的真实定位：它服务的是以 AI 产品、数据产品、Agent 产品方向为核心的求职助手，不是泛岗位搜索工具。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“Discover 默认面向国内 AI/产品岗位”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Discover 默认面向国内 AI/产品岗位”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Discover 默认面向国内 AI/产品岗位”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/job-discovery-dedup.test.ts`: normalizes common URL variants to the same canonical job URL

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 工作台展示扫描岗位状态 badges

**状态**: 已有自动化覆盖

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- - `src/app/discover/page.tsx` - `src/app/api/scan/route.ts` - `src/app/api/scan/status/route.ts` - `src/app/api/scan/history/route.ts` - `src/app/api/scan/jobs/route.ts` - `src/app...
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“工作台展示扫描岗位状态 badges”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“工作台展示扫描岗位状态 badges”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“工作台展示扫描岗位状态 badges”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-save-api.test.ts`: creates a discovery-sourced JD and marks the scan job saved
- `src/__tests__/discovery-save-api.test.ts`: reuses an existing discovery JD and marks the scan job evaluating

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 保存岗位后出现 JD 管理入口

**状态**: 已有自动化覆盖

**项目依据**:
- 岗位发现扫描系统处在纸鸢求职助手的机会入口层。JD 评分系统解决的是“用户已经拿到一份 JD 以后如何判断”，岗位发现扫描系统解决的是更前面的事情：用户还没有稳定机会池时，系统如何按目标方向、目标公司、关键词和地点持续发现可评估的岗位。
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“保存岗位后出现 JD 管理入口”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“保存岗位后出现 JD 管理入口”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“保存岗位后出现 JD 管理入口”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: only shows JD management affordance after a discovery job is saved
- `src/__tests__/discovery-save-api.test.ts`: creates a discovery-sourced JD and marks the scan job saved
- `src/__tests__/discovery-save-api.test.ts`: reuses an existing discovery JD and marks the scan job evaluating

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. /api/scan/jobs/[id]/jd 保存 JD

**状态**: 已有自动化覆盖

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- 1. 它不自动投递。发现岗位只是进入机会池，用户仍要查看 JD、保存或评估。 2. 它不绕过招聘平台风控。遇到验证码或安全验证时写入错误。 3. 它不承诺所有岗位都能抓取正文。自动抓取失败时允许用户手动粘贴 JD。 4. 它不把 Postgres 迁移中未完成的 worker 当作可用能力。Postgres 模式下 `/api/scan` 明确阻断。 5. ...
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“/api/scan/jobs/[id]/jd 保存 JD”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“/api/scan/jobs/[id]/jd 保存 JD”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“/api/scan/jobs/[id]/jd 保存 JD”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: keeps dismissed jobs out of the default list but available through a filter
- `src/__tests__/discovery-ui.test.ts`: defaults discovery scanning toward Chinese AI/product roles and domestic companies

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 明确海外或 remote 海外岗位被过滤

**状态**: 已有自动化覆盖

**项目依据**:
- 它的核心不是抓取技术，而是机会数据的状态化：用户输入目标，系统创建任务，外部岗位被过滤和去重，结果进入机会池，用户再决定保存、评估或跳过。只有当这个状态链路成立时，岗位发现才不是一次性搜索，而是纸鸢求职助手全生命周期的第一环。
- 岗位过滤逻辑在 `lib/scan/orchestrator.mjs`。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“明确海外或 remote 海外岗位被过滤”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“明确海外或 remote 海外岗位被过滤”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“明确海外或 remote 海外岗位被过滤”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/scan-domestic-filter.test.ts`: keeps domestic and unknown-location jobs while rejecting explicit overseas or remote jobs
- `src/__tests__/job-discovery-dedup.test.ts`: normalizes common URL variants to the same canonical job URL

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. 未知地点和国内岗位保留

**状态**: 已有自动化覆盖

**项目依据**:
- 这里保留地点为空的岗位，是为了避免误杀。很多公司官网的列表页不会展示城市，如果因为地点为空就丢掉，会损失潜在机会。产品上更合理的做法是保留，再由用户查看 JD 时确认。
- 岗位发现扫描系统处在纸鸢求职助手的机会入口层。JD 评分系统解决的是“用户已经拿到一份 JD 以后如何判断”，岗位发现扫描系统解决的是更前面的事情：用户还没有稳定机会池时，系统如何按目标方向、目标公司、关键词和地点持续发现可评估的岗位。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“未知地点和国内岗位保留”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“未知地点和国内岗位保留”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“未知地点和国内岗位保留”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: keeps dismissed jobs out of the default list but available through a filter
- `src/__tests__/discovery-ui.test.ts`: only shows JD management affordance after a discovery job is saved

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 未保存岗位不进 JD 库

**状态**: 已有自动化覆盖

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- - 用户配置自己关心的岗位关键词、排除关键词、城市和结果上限。 - 系统按照公司官网优先、招聘平台补扫的顺序发现岗位。 - 用户对发现到的岗位做下一步处理：查看 JD、保存到 JD 库、交给 Agent 评估、跳过。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“未保存岗位不进 JD 库”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“未保存岗位不进 JD 库”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“未保存岗位不进 JD 库”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: keeps dismissed jobs out of the default list but available through a filter
- `src/__tests__/discovery-ui.test.ts`: only shows JD management affordance after a discovery job is saved

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. dismissed 岗位默认不出主列表

**状态**: 已有自动化覆盖

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- 这里保留地点为空的岗位，是为了避免误杀。很多公司官网的列表页不会展示城市，如果因为地点为空就丢掉，会损失潜在机会。产品上更合理的做法是保留，再由用户查看 JD 时确认。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“dismissed 岗位默认不出主列表”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“dismissed 岗位默认不出主列表”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“dismissed 岗位默认不出主列表”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: keeps dismissed jobs out of the default list but available through a filter
- `src/__tests__/discovery-ui.test.ts`: only shows JD management affordance after a discovery job is saved

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. URL 变体重复展示

**状态**: 已有自动化覆盖

**项目依据**:
- `createScanEntryForUser()` 会先检查当前用户是否已有 `pending` 或 `running` 任务。如果有，返回 `{ conflict: true }`，页面提示“扫描已在运行中”。这样可以避免同一用户重复启动多个扫描 worker。
- 写入 `scan_jobs` 时使用 `INSERT OR IGNORE`。这意味着同一个岗位链接不会反复生成新记录。用户看到的是新的机会，而不是重复噪声。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“URL 变体重复展示”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“URL 变体重复展示”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“URL 变体重复展示”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/job-discovery-fingerprint.test.ts`: hints weak duplicates without merging different normalized URLs

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 默认公司配置回退 OpenAI/Anthropic

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- - 用户配置自己关心的岗位关键词、排除关键词、城市和结果上限。 - 系统按照公司官网优先、招聘平台补扫的顺序发现岗位。 - 用户对发现到的岗位做下一步处理：查看 JD、保存到 JD 库、交给 Agent 评估、跳过。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“默认公司配置回退 OpenAI/Anthropic”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“默认公司配置回退 OpenAI/Anthropic”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“默认公司配置回退 OpenAI/Anthropic”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: keeps dismissed jobs out of the default list but available through a filter

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 未保存岗位显示去 JD 管理

**状态**: 已有自动化覆盖

**项目依据**:
- 这个系统不是“搜索框 + 列表页”。它把目标公司配置、扫描任务、外部页面抓取、岗位去重、状态流转、JD 保存和 Agent 评估连接成一条产品链路。它的价值在于让求职机会从零散浏览变成可沉淀、可筛选、可继续加工的数据资产。
- - 用户配置自己关心的岗位关键词、排除关键词、城市和结果上限。 - 系统按照公司官网优先、招聘平台补扫的顺序发现岗位。 - 用户对发现到的岗位做下一步处理：查看 JD、保存到 JD 库、交给 Agent 评估、跳过。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“未保存岗位显示去 JD 管理”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“未保存岗位显示去 JD 管理”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“未保存岗位显示去 JD 管理”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: keeps dismissed jobs out of the default list but available through a filter
- `src/__tests__/discovery-ui.test.ts`: only shows JD management affordance after a discovery job is saved

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 岗位发现命名回退到职位搜索

**状态**: 已有自动化覆盖

**项目依据**:
- 这套状态让岗位发现系统不是一次性搜索结果，而是一个可操作的机会池。
- 它的核心不是抓取技术，而是机会数据的状态化：用户输入目标，系统创建任务，外部岗位被过滤和去重，结果进入机会池，用户再决定保存、评估或跳过。只有当这个状态链路成立时，岗位发现才不是一次性搜索，而是纸鸢求职助手全生命周期的第一环。
- 主要实现面：`src/app/discover/page.tsx`、`src/app/api/scan/route.ts`、`src/app/api/scan/jobs/route.ts`、`src/app/api/scan/jobs/[id]/jd/route.ts`。

**输入/fixture**:
- 正例：国内 AI/产品岗位扫描、保存岗位、抓取 JD、Agent Chat 岗位发现卡片，用来验证“岗位发现命名回退到职位搜索”的成功路径。
- 反例：海外岗位、URL 变体重复、未保存岗位、dismissed 状态、旧产品文案，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：scanId、jobId、jobFingerprint、status、sourceUrl、jdId 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 Discover 工作台、scan_queue/scan_jobs、scan-portals 工具和 /api/scan/jobs 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“岗位发现命名回退到职位搜索”对应动作，并记录请求、工具调用或页面状态。
3. 读取 scan_jobs 记录、规范化 URL、岗位卡片、JD 保存读回和 UI 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“岗位发现命名回退到职位搜索”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 岗位发现扫描系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/discovery-ui.test.ts`: uses job discovery workbench product language
- `src/__tests__/discovery-ui.test.ts`: shows lightweight scan job state badges on discovery cards
- `src/__tests__/discovery-ui.test.ts`: only shows JD management affordance after a discovery job is saved
- `src/__tests__/discovery-save-api.test.ts`: creates a discovery-sourced JD and marks the scan job saved

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/discovery-ui.test.ts`
  - uses job discovery workbench product language
  - shows lightweight scan job state badges on discovery cards
  - keeps dismissed jobs out of the default list but available through a filter
  - defaults discovery scanning toward Chinese AI/product roles and domestic companies
  - only shows JD management affordance after a discovery job is saved
- `src/__tests__/discovery-save-api.test.ts`
  - verifies read-back after direct JD create and update
  - creates a discovery-sourced JD and marks the scan job saved
  - reuses an existing discovery JD and marks the scan job evaluating
- `src/__tests__/scan-domestic-filter.test.ts`
  - keeps domestic and unknown-location jobs while rejecting explicit overseas or remote jobs
  - allows domestic text even when a company describes China-wide remote collaboration
- `src/__tests__/scan-jobs-api.test.ts`
  - filters scan jobs by scanId without leaking other scan results
  - supports incremental polling with after
  - gets all jobs for a run through the shared helper when status is omitted
- `src/__tests__/job-discovery-dedup.test.ts`
  - normalizes common URL variants to the same canonical job URL
  - preserves meaningful query params and sorts them before hashing
- `src/__tests__/job-discovery-fingerprint.test.ts`
  - uses the normalized URL as the shared card fingerprint
  - merges URL variants and keeps the most progressed card state
  - hints weak duplicates without merging different normalized URLs


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 岗位发现扫描系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
