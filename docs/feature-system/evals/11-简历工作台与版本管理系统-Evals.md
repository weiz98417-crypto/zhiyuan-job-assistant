# 简历工作台与版本管理系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 简历工作台与版本管理系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

CV 导入、sectioning、版本、对比、PDF 导出、当前简历读取和 Agent 写入边界。

## 项目事实

### 关键实现面
- `src/app/cv/page.tsx`
- `src/app/cv/version-diff.tsx`
- `src/app/api/cv/route.ts`
- `src/app/api/generate-cv-pdf/route.ts`
- `src/lib/cv-storage.ts`
- `src/lib/agent/resume-save-guard.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/cv-import-sectioning.test.ts`
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`
- `src/__tests__/file-export-verified-write.test.ts`
- `src/__tests__/resume-save-guard.test.ts`
- `src/__tests__/resume-edit-proposals-route.test.ts`
- `src/__tests__/document-extraction.test.ts`
- `src/__tests__/qwenlong-removal.test.ts`

### 从现有测试读到的行为
- cv-import-sectioning.test.ts 已覆盖模型混合 section 时把项目块从 experience 移到 projects。
- resume-save-guard.test.ts 已覆盖当前简历写入必须走 proposal/read-back，避免 Agent 静默覆盖。
- file-export-verified-write.test.ts 已覆盖导出文件的 size/hash/read-back 证据。

### 待补 eval 缺口
- 补 cv-version-management.test.ts 固定版本创建、切换、对比。
- 补 CV 页面导入失败不覆盖旧简历的 UI eval。
- 补 PDF 生成视觉/字节端到端 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 cv-version-management.test.ts 固定版本创建、切换、对比

**为什么要补**: 这是当前 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/cv-import-sectioning.test.ts`、`src/__tests__/cv-optimize-postgres-boundary.test.ts`、`src/__tests__/file-export-verified-write.test.ts`、`src/__tests__/resume-save-guard.test.ts`、`src/__tests__/resume-edit-proposals-route.test.ts`。
- fixture 必须包含：cvId、section key、version/hash、storage backend、export bytes 和 owner userId。
- 断言必须读取：sections_json、current version、read-back hash、PDF bytes 和 repository boundary。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 CV 页面导入失败不覆盖旧简历的 UI eval

**为什么要补**: 这是当前 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/cv-import-sectioning.test.ts`、`src/__tests__/cv-optimize-postgres-boundary.test.ts`、`src/__tests__/file-export-verified-write.test.ts`、`src/__tests__/resume-save-guard.test.ts`、`src/__tests__/resume-edit-proposals-route.test.ts`。
- fixture 必须包含：cvId、section key、version/hash、storage backend、export bytes 和 owner userId。
- 断言必须读取：sections_json、current version、read-back hash、PDF bytes 和 repository boundary。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 PDF 生成视觉/字节端到端 eval

**为什么要补**: 这是当前 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/cv-import-sectioning.test.ts`、`src/__tests__/cv-optimize-postgres-boundary.test.ts`、`src/__tests__/file-export-verified-write.test.ts`、`src/__tests__/resume-save-guard.test.ts`、`src/__tests__/resume-edit-proposals-route.test.ts`。
- fixture 必须包含：cvId、section key、version/hash、storage backend、export bytes 和 owner userId。
- 断言必须读取：sections_json、current version、read-back hash、PDF bytes 和 repository boundary。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 简历工作台与版本管理系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 简历导入能拆成 section

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手里的简历工作台，不是一个“粘贴简历文本”的输入框，也不是单纯的富文本编辑器。它是用户求职材料的资产中心：用户把简历导入、拆分、编辑、保存、对比、分析、导出之后，后续 JD 评估、简历优化、面试准备、求职画像、Agent 工具调用都会读取这份简历资产。
- - 用户可以从 PDF、图片、Word、纯文本等材料中导入简历。 - 简历进入系统后要拆成固定板块，便于 JD 评估和 Agent 调用。 - 用户可以手动编辑，也可以让 AI 生成优化版本。 - 每次形成新版本后，用户能看到与旧版本的差异。 - 简历既要保存在浏览器本地，也要同步到当前登录用户的服务端数据。 - PDF 导出必须能生成真实文件，而不是只显示...
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“简历导入能拆成 section”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“简历导入能拆成 section”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“简历导入能拆成 section”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: does not hijack excellent reference resume save requests
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot
- `src/__tests__/resume-save-guard.test.ts`: blocks applying a stale resume edit proposal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 嵌入项目块从 experience 移到 projects

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - `summary` - `skills` - `experience` - `projects` - `education`
- 第二，简历不是一整块文本就够了。JD 评估需要读取整体经历，简历优化需要定位到某个板块，面试准备需要抽取项目故事，PDF 导出需要把个人概述、工作经历、项目经验、教育背景、技能放进对应版式。没有结构化板块，这些动作都会变得不稳定。
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“嵌入项目块从 experience 移到 projects”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“嵌入项目块从 experience 移到 projects”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“嵌入项目块从 experience 移到 projects”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-import-sectioning.test.ts`: moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 文件导出返回 size/hash/read-back

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/cv-optimize-postgres-boundary.test.ts`：验证简历优化和数据仓储边界，防止把 Postgres/SQLite 切换写混。 - `src/__tests__/file-export-verified-write.test.ts`：验证文件导出必须返回 size、sha256、read-bac...
- 这说明 PDF 导出是正式投递链路的一部分，不是附属按钮。导出失败、空文件、hash 不匹配都不能被产品说成成功。
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“文件导出返回 size/hash/read-back”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“文件导出返回 size/hash/read-back”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“文件导出返回 size/hash/read-back”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 当前简历读取是只读任务

**状态**: 已有自动化覆盖

**项目依据**:
- 因此，简历版本对比不应该单独写成一个独立系统。它是简历工作台里的审阅能力，用来回答“这次修改到底动了哪里、右侧版本是否可以设为当前版本”。完整的产品边界应该是：简历内容如何进入系统、如何被拆成结构化板块、如何形成版本、如何同步到服务端、如何被 Agent 安全读取和修改、如何导出成可投递材料。
- - 用户可以从 PDF、图片、Word、纯文本等材料中导入简历。 - 简历进入系统后要拆成固定板块，便于 JD 评估和 Agent 调用。 - 用户可以手动编辑，也可以让 AI 生成优化版本。 - 每次形成新版本后，用户能看到与旧版本的差异。 - 简历既要保存在浏览器本地，也要同步到当前登录用户的服务端数据。 - PDF 导出必须能生成真实文件，而不是只显示...
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“当前简历读取是只读任务”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“当前简历读取是只读任务”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“当前简历读取是只读任务”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: does not hijack excellent reference resume save requests
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot
- `src/__tests__/resume-save-guard.test.ts`: blocks applying a stale resume edit proposal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. Agent 不能静默覆盖 CV

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这些测试背后的产品目标是一致的：简历是用户的核心求职资产，系统可以帮忙生成和分析，但不能伪造保存、不能静默覆盖、不能把临时对话当成正式履历。
- - 用户可以从 PDF、图片、Word、纯文本等材料中导入简历。 - 简历进入系统后要拆成固定板块，便于 JD 评估和 Agent 调用。 - 用户可以手动编辑，也可以让 AI 生成优化版本。 - 每次形成新版本后，用户能看到与旧版本的差异。 - 简历既要保存在浏览器本地，也要同步到当前登录用户的服务端数据。 - PDF 导出必须能生成真实文件，而不是只显示...
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“Agent 不能静默覆盖 CV”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Agent 不能静默覆盖 CV”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Agent 不能静默覆盖 CV”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-import-sectioning.test.ts`: moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 占位符和流程说明不能保存

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - `src/__tests__/cv-optimize-postgres-boundary.test.ts`：验证简历优化和数据仓储边界，防止把 Postgres/SQLite 切换写混。 - `src/__tests__/file-export-verified-write.test.ts`：验证文件导出必须返回 size、sha256、read-bac...
- - 用户可以从 PDF、图片、Word、纯文本等材料中导入简历。 - 简历进入系统后要拆成固定板块，便于 JD 评估和 Agent 调用。 - 用户可以手动编辑，也可以让 AI 生成优化版本。 - 每次形成新版本后，用户能看到与旧版本的差异。 - 简历既要保存在浏览器本地，也要同步到当前登录用户的服务端数据。 - PDF 导出必须能生成真实文件，而不是只显示...
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“占位符和流程说明不能保存”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“占位符和流程说明不能保存”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“占位符和流程说明不能保存”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-import-sectioning.test.ts`: moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. Postgres/SQLite 边界不写混

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - `src/__tests__/cv-optimize-postgres-boundary.test.ts`：验证简历优化和数据仓储边界，防止把 Postgres/SQLite 切换写混。 - `src/__tests__/file-export-verified-write.test.ts`：验证文件导出必须返回 size、sha256、read-bac...
- 因此，简历版本对比不应该单独写成一个独立系统。它是简历工作台里的审阅能力，用来回答“这次修改到底动了哪里、右侧版本是否可以设为当前版本”。完整的产品边界应该是：简历内容如何进入系统、如何被拆成结构化板块、如何形成版本、如何同步到服务端、如何被 Agent 安全读取和修改、如何导出成可投递材料。
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“Postgres/SQLite 边界不写混”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Postgres/SQLite 边界不写混”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Postgres/SQLite 边界不写混”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-import-sectioning.test.ts`: moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 跨用户 CV 不互读

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 第二层是服务端 `/api/cv/data`。这个接口通过 `getCurrentUser()` 拿到当前登录用户，再用 `getDataRepositories().cv` 读取或写入该用户的 `cv_data`。
- 纸鸢求职助手里的简历工作台，不是一个“粘贴简历文本”的输入框，也不是单纯的富文本编辑器。它是用户求职材料的资产中心：用户把简历导入、拆分、编辑、保存、对比、分析、导出之后，后续 JD 评估、简历优化、面试准备、求职画像、Agent 工具调用都会读取这份简历资产。
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“跨用户 CV 不互读”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“跨用户 CV 不互读”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“跨用户 CV 不互读”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-import-sectioning.test.ts`: moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 项目块混入经历

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 如果工作经历里混入“项目名称：”块，会尝试拆出项目经验。 - 如果个人信息或概述里混入教育背景，会把学校、学历、专业等内容挪到教育背景。
- 第二，简历不是一整块文本就够了。JD 评估需要读取整体经历，简历优化需要定位到某个板块，面试准备需要抽取项目故事，PDF 导出需要把个人概述、工作经历、项目经验、教育背景、技能放进对应版式。没有结构化板块，这些动作都会变得不稳定。
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“项目块混入经历”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“项目块混入经历”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“项目块混入经历”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/cv-import-sectioning.test.ts`: moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`: exposes recent optimization preferences through both repository drivers

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. pending proposal 刷新丢失

**状态**: 已有自动化覆盖

**项目依据**:
- 第一层是浏览器本地 `localStorage`，key 是 `zhiyuan-cv`。这让页面刷新后仍能保留当前简历状态，也能支持一些即时编辑体验。
- 第二层是 `resume-edit-proposals.ts`。它把修改变成提案：
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“pending proposal 刷新丢失”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“pending proposal 刷新丢失”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“pending proposal 刷新丢失”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot
- `src/__tests__/resume-save-guard.test.ts`: discards a pending proposal through the tool with status read-back
- `src/__tests__/resume-edit-proposals-route.test.ts`: keeps the default pending proposal list behavior

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. 回滚覆盖用户后续编辑

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手里的简历工作台，不是一个“粘贴简历文本”的输入框，也不是单纯的富文本编辑器。它是用户求职材料的资产中心：用户把简历导入、拆分、编辑、保存、对比、分析、导出之后，后续 JD 评估、简历优化、面试准备、求职画像、Agent 工具调用都会读取这份简历资产。
- - 用户可以从 PDF、图片、Word、纯文本等材料中导入简历。 - 简历进入系统后要拆成固定板块，便于 JD 评估和 Agent 调用。 - 用户可以手动编辑，也可以让 AI 生成优化版本。 - 每次形成新版本后，用户能看到与旧版本的差异。 - 简历既要保存在浏览器本地，也要同步到当前登录用户的服务端数据。 - PDF 导出必须能生成真实文件，而不是只显示...
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“回滚覆盖用户后续编辑”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“回滚覆盖用户后续编辑”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“回滚覆盖用户后续编辑”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: blocks rollback when the section changed after proposal apply
- `src/__tests__/resume-edit-proposals-route.test.ts`: lists the latest applied proposal for the rollback affordance

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. PDF ready 缺字节证据

**状态**: 已有自动化覆盖

**项目依据**:
- - 用户可以从 PDF、图片、Word、纯文本等材料中导入简历。 - 简历进入系统后要拆成固定板块，便于 JD 评估和 Agent 调用。 - 用户可以手动编辑，也可以让 AI 生成优化版本。 - 每次形成新版本后，用户能看到与旧版本的差异。 - 简历既要保存在浏览器本地，也要同步到当前登录用户的服务端数据。 - PDF 导出必须能生成真实文件，而不是只显示...
- 第二，简历不是一整块文本就够了。JD 评估需要读取整体经历，简历优化需要定位到某个板块，面试准备需要抽取项目故事，PDF 导出需要把个人概述、工作经历、项目经验、教育背景、技能放进对应版式。没有结构化板块，这些动作都会变得不稳定。
- 主要实现面：`src/app/cv/page.tsx`、`src/app/cv/version-diff.tsx`、`src/app/api/cv/route.ts`、`src/app/api/generate-cv-pdf/route.ts`。

**输入/fixture**:
- 正例：一份包含 experience/projects/skills 的简历文件或文本，用来验证“PDF ready 缺字节证据”的成功路径。
- 反例：占位符、Postgres/SQLite 边界、跨用户 CV、项目块嵌套经历，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：cvId、section key、version/hash、storage backend、export bytes 和 owner userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 CV 工作台、cv-storage、document extraction、sectioning 和 PDF/文件导出 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“PDF ready 缺字节证据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 sections_json、current version、read-back hash、PDF bytes 和 repository boundary，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“PDF ready 缺字节证据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历工作台与版本管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: verifies PDF bytes and SHA-256 before reporting a PDF download as ready

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/cv-import-sectioning.test.ts`
  - moves embedded project blocks out of experience when the model returns mixed sections
- `src/__tests__/cv-optimize-postgres-boundary.test.ts`
  - keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb
  - exposes recent optimization preferences through both repository drivers
- `src/__tests__/file-export-verified-write.test.ts`
  - writes exported files and returns read-back size/hash evidence
  - requires file hash evidence before a file export task can claim success
  - rejects server export tool success when read-back hash evidence is absent
  - verifies PDF bytes and SHA-256 before reporting a PDF download as ready
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
- `src/__tests__/resume-edit-proposals-route.test.ts`
  - lists the latest applied proposal for the rollback affordance
  - keeps the default pending proposal list behavior
- `src/__tests__/document-extraction.test.ts`
  - uses local PDF text extraction before MinerU when the PDF already has usable text
  - falls back to MinerU when a PDF has no usable embedded text
  - maps MinerU timeout into a structured mineru_timeout error
  - keeps DOCX on mammoth text extraction when mammoth returns usable text
  - fails legacy .doc clearly when no local converter is configured
- `src/__tests__/qwenlong-removal.test.ts`
  - keeps DashScope/qwen-long out of CV file parsing routes
  - keeps qwen-long out of agent reasoning fallback chains


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 简历工作台与版本管理系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
