# 岗位发现 Agent 化实施任务与 Evals

本文档承接“Agent Chat 发起岗位发现，岗位发现工作台管理机会池”的架构决策。目标是把当前 Discover 页面、scan worker、`scan_queue` / `scan_jobs`、JD 抓取保存链路和 Agent Chat `uiPayload` 能力整合成对话式岗位发现体验。

## 实施任务清单

### 0. 修复岗位去重

**目标**: 先解决当前界面重复岗位问题，避免 Agent Chat 放大重复结果。
- 新增 `normalizeJobUrl(url)`，去掉 hash、常见 tracking 参数、无意义 query，统一 host 大小写和尾部斜杠。
- 改造 `makeDedupKey(url)`，基于规范化 URL 生成强岗位指纹。
- 保留原始 `url` 作为原 JD 链接，不把展示链接替换成规范化 URL。
- Discover 页面和 Agent Chat 结果卡使用同一套 `jobFingerprint` 合并逻辑。
- 增加弱重复提示：同公司、同岗位标题、同城市只提示“可能重复”，不直接阻止入库。

### 1. 统一产品语言

**目标**: 用户可见文案统一为“岗位发现”。
- 导航、页面标题、Agent 工具展示名使用“岗位发现工作台”或“开始岗位发现”。
- 更多结果入口使用“去岗位发现工作台查看全部”。
- 避免继续使用“职位搜索”“搜索职位”“搜索结果列表”作为正式产品名。

### 2. 补齐 job_search 路由

**目标**: 用户在 Agent Chat 里说“帮我找岗位 / 搜职位 / 扫一批 JD”时稳定进入岗位发现任务。
- task routing 识别岗位发现意图。
- 模糊请求优先进入确认，不直接执行扫描。
- 用户画像可用于预填目标岗位、城市或底线条件，但必须在确认卡中明示。
- 没有明确岗位关键词且画像也没有目标岗位时，Agent 只追问一次。

### 3. 改造 `scan_portals`

**目标**: 从浅工具改成真实岗位发现入口。
- 不再调用错误的 `/api/scan/status` POST。
- 复用现有 `/api/scan` 或抽出的 server helper 创建 `scan_queue`。
- 返回三段式结果：`llmSummary`、`uiPayload`、`rawData`。
- 成功必须 read-back 到 `scan_queue`，并返回 `scanId`。
- 如果用户尚未确认，先返回 `job_discovery_confirmation`，不创建扫描任务。

### 4. 新增岗位发现确认卡

**目标**: 扫描会写入岗位机会池，必须轻量确认。
- 展示关键词、排除词、城市、结果上限和来源说明。
- 默认排除词沿用 Discover 配置：实习、销售、客服、外包、劳务、兼职、电话销售、地推。
- 第一版只说明公司官网优先、必要时平台补扫，不开放复杂来源选择。
- 主按钮为“开始岗位发现”，次按钮为“调整条件”“先不开始”。

### 5. 新增岗位发现运行卡

**目标**: 在 Chat 里体现扫描工作状态。
- 展示 `pending / running / done / failed / canceled`。
- 展示已扫描公司数、总公司数、已发现岗位数、新岗位数。
- 展示摘要级失败状态，例如“2 个超时，1 个触发安全验证”。
- 提供取消扫描。
- 扫描完成后提供“去岗位发现工作台查看全部”。

### 6. 新增岗位发现结果卡

**目标**: 扫到几个岗位就显示几个，但 Chat 默认只展示前 5 个。
- 每张卡展示公司、岗位名、地点、来源、摘要、状态。
- 主动作为“打开 JD”。
- 次动作包括评估、保存、原链接、跳过。
- JD 抓取失败时主动作降级为“打开原链接”，并提供手动粘贴 JD。
- 点击“评估”不二次确认，但文案明示会先保存到 JD 库，再进入 Agent 评估。
- 第一版不做批量保存或批量评估。

### 7. 补强扫描结果接口

**目标**: 支持当前扫描的增量结果，不混入历史岗位。
- `/api/scan/jobs` 增加 `scanId` 参数。
- 可选增加 `after` 或 `since` 参数支持增量拉取。
- `src/lib/scan-data.ts` 增加 `getScanJobsForRun(userId, scanId, opts)`，保持 SQLite / Postgres 双路径。
- Chat 和 Discover 页面都使用同一套结果读取 helper。

### 8. 抽取 Discover 共享模块

**目标**: Discover 页面和 Agent Chat 不复制两套岗位卡片逻辑。
- 抽取 `JobDiscoveryRunCard`。
- 抽取 `JobDiscoveryCard`。
- 抽取 `JobDiscoveryDetailDialog`。
- 抽取 `job-discovery-client` helper。
- Discover 页面保留为岗位发现工作台，负责全部结果、历史、失败来源、高级筛选和未来持续岗位发现配置。

### 9. 接入现有 JD 评估链路

**目标**: 第一版复用现有 `/agent?jdId=...&intent=evaluate`，不把完整评估流塞进岗位发现卡片。
- 点击评估时调用 `POST /api/scan/jobs/[id]/jd { evaluate: true }`。
- 得到 `jdId` 后进入现有 JD 评估链路。
- 岗位发现结果先进入岗位机会池，用户保存或评估后才进入 JD 库。

### 10. 规划持续岗位发现

**目标**: 不进入第一版实现，但命名和数据模型不堵死未来能力。
- 持续岗位发现配置放在岗位发现工作台。
- Agent Chat 只负责引导创建或修改。
- 未来支持频率、暂停、恢复、删除、上次运行结果。
- 重复岗位未来更新 `last_seen_at` / `seen_count`，不新增噪声记录。

## 基线 Evals

### B1. Agent Chat 能进入岗位发现确认

**状态**: 已落地/部分落地，按下方测试映射确认；未映射的断言标记为待补。

**测试目标**: 验证“Agent Chat 能进入岗位发现确认”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“Agent Chat 能进入岗位发现确认”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### B2. 确认后创建真实扫描任务

**状态**: 已落地/部分落地，按下方测试映射确认；未映射的断言标记为待补。

**测试目标**: 验证“确认后创建真实扫描任务”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“确认后创建真实扫描任务”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### B3. 扫描运行卡展示进度

**状态**: 已落地/部分落地，按下方测试映射确认；未映射的断言标记为待补。

**测试目标**: 验证“扫描运行卡展示进度”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“扫描运行卡展示进度”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### B4. 扫到岗位后出现结果卡

**状态**: 已落地/部分落地，按下方测试映射确认；未映射的断言标记为待补。

**测试目标**: 验证“扫到岗位后出现结果卡”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“扫到岗位后出现结果卡”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### B5. 打开 JD 复用现有抓取链路

**状态**: 已落地/部分落地，按下方测试映射确认；未映射的断言标记为待补。

**测试目标**: 验证“打开 JD 复用现有抓取链路”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“打开 JD 复用现有抓取链路”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### B6. 评估复用现有 JD 评估链路

**状态**: 已落地/部分落地，按下方测试映射确认；未映射的断言标记为待补。

**测试目标**: 验证“评估复用现有 JD 评估链路”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“评估复用现有 JD 评估链路”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`


## 边界 Evals

### E1. 模糊请求不能静默创建扫描

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“模糊请求不能静默创建扫描”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“模糊请求不能静默创建扫描”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E2. 画像预填必须明示

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“画像预填必须明示”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“画像预填必须明示”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E3. 当前用户已有 active scan 时不重复创建

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“当前用户已有 active scan 时不重复创建”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“当前用户已有 active scan 时不重复创建”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E4. 默认不自动保存到 JD 库

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“默认不自动保存到 JD 库”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“默认不自动保存到 JD 库”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E5. Chat 不能展示全部结果

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“Chat 不能展示全部结果”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“Chat 不能展示全部结果”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E6. 弱重复不能阻止入库

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“弱重复不能阻止入库”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“弱重复不能阻止入库”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E7. 抓取失败不能假装成功

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“抓取失败不能假装成功”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“抓取失败不能假装成功”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### E8. 工具治理必须阻止未确认写入

**状态**: 部分边界已有测试；凡涉及权限、写入、跨用户或任务切换的缺口必须补自动化。

**测试目标**: 验证“工具治理必须阻止未确认写入”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“工具治理必须阻止未确认写入”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`


## 回归 Evals

### R1. URL 变体不会重复出现

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“URL 变体不会重复出现”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“URL 变体不会重复出现”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R2. scan_portals 不能回退成纯文本计数

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“scan_portals 不能回退成纯文本计数”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“scan_portals 不能回退成纯文本计数”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R3. Discover 页面和 Chat 使用同一状态语义

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“Discover 页面和 Chat 使用同一状态语义”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“Discover 页面和 Chat 使用同一状态语义”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R4. 换一批不能立即重新扫描

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“换一批不能立即重新扫描”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“换一批不能立即重新扫描”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R5. 已跳过岗位默认不出现在工作台主列表

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“已跳过岗位默认不出现在工作台主列表”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“已跳过岗位默认不出现在工作台主列表”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R6. 评估动作必须写回 scan_jobs.jd_id

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“评估动作必须写回 scan_jobs.jd_id”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“评估动作必须写回 scan_jobs.jd_id”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R7. 失败来源不在 Chat 中刷屏

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“失败来源不在 Chat 中刷屏”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“失败来源不在 Chat 中刷屏”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`

### R8. 持续岗位发现不进入 MVP

**状态**: 用于固定历史问题和高概率回归；已有测试不足时先写失败用例。

**测试目标**: 验证“持续岗位发现不进入 MVP”在当前功能语义下成立。评测不能只看页面文案或模型回复，必须能回到源码、API 响应、数据库记录、文件 hash、run evidence 或 UI 状态中的至少一种证据。

**起始条件**:
- 使用该功能最小真实入口：页面、API、Agent 工具、脚本或现有 fixture。
- 准备一组正例和一组反例，反例必须覆盖 owner scope、状态、任务类型或输入来源中的至少一个边界。
- 如果场景涉及写入，写入类场景必须读取持久化结果，记录 owner scope、状态、hash、read-back 或事务回滚证据，不能只看 assistant 文案。

**步骤**:
1. 以当前用户身份触发场景，不绕过产品入口直接改内部状态。
2. 执行动作后记录请求参数、工具名、runId、stepId、record id 或页面状态。
3. 读取结果证据：API JSON、数据库记录、文件 hash、页面断言、Admin review 或错误文案。
4. 对照 岗位发现扫描系统 的 feature 文档和本节期望，判断是通过、待补自动化，还是需要修复实现。

**期望结果**:
- 行为符合“持续岗位发现不进入 MVP”的产品语义。
- 成功态有可复跑证据，失败态可诊断且不会留下部分写入。
- 数据不会越过当前用户、当前任务或明确允许的团队范围。
- 若当前没有自动化覆盖，本条必须在文档中保持“待补”身份，不能写成已完成事实。

**证据/建议落点**: `src/__tests__/discovery-ui.test.ts`<br>`src/__tests__/discovery-save-api.test.ts`<br>`src/__tests__/scan-domestic-filter.test.ts`<br>`src/__tests__/scan-jobs-api.test.ts`<br>`src/__tests__/job-discovery-dedup.test.ts`


## 建议测试文件映射

| Eval 类别 | 建议落点 |
|---|---|
| 基线 B1/B2/B3 | `src/__tests__/job-discovery-agent-evals.test.ts`、`src/__tests__/scan-portals-tool.test.ts` |
| 基线 B4/B5/B6 | `src/__tests__/agent-chat-job-discovery-ui.test.ts`、`src/__tests__/scan-jobs-api.test.ts` |
| 边界 E1/E2/E8 | `src/__tests__/agent-task-routing.test.ts`、`src/__tests__/agent-tool-governance.test.ts` |
| 边界 E3/E4/E6/E7 | `src/__tests__/job-discovery-agent-evals.test.ts` |
| 回归 R1/R3/R4/R5 | `src/__tests__/job-discovery-dedup.test.ts`、`src/__tests__/job-discovery-fingerprint.test.ts` |
| 回归 R2/R6/R7/R8 | `src/__tests__/job-discovery-agent-evals.test.ts`、`src/__tests__/agent-runtime-regressions.eval.test.ts` |

## 最小上线门槛

- 第 0 步去重修复通过。
- B1-B6 全部通过。
- E1、E3、E4、E7、E8 必须通过。
- R1、R2、R4、R6 必须通过。
- 桌面视觉 QA 确认 Chat 中 5 张岗位卡不会撑破布局。
