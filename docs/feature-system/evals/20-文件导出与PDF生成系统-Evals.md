# 文件导出与PDF生成系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 文件导出与PDF生成系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

export-file API、Markdown/HTML 输出、GET 下载、PDF report download、Content-Length、SHA-256 和 Agent file_export 合同。

## 项目事实

### 关键实现面
- `src/app/api/export-file/route.ts`
- `src/app/api/reports/[reportNum]/pdf/route.ts`
- `src/lib/exporters.ts`
- `src/lib/agent/tools/action/export-file.ts`
- `src/lib/agent/tools/action/download-report-pdf.ts`
- `src/lib/agent/task-contract.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/file-export-verified-write.test.ts`

### 从现有测试读到的行为
- file-export-verified-write.test.ts 已覆盖导出文件写入并返回 read-back size/hash。
- 同一测试已覆盖 file_export task 必须有 file hash verified 才能 claim success。
- PDF download 必须验证 bytes 与 SHA-256 后才算 ready。

### 待补 eval 缺口
- 补路径穿越 GET /api/export-file?file=../ 的安全 eval。
- 补空内容导出失败 eval。
- 补不存在 reportNum 的 PDF 下载失败 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补路径穿越 GET /api/export-file?file=../ 的安全 eval

**为什么要补**: 这是当前 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/file-export-verified-write.test.ts`。
- fixture 必须包含：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified。
- 断言必须读取：文件字节、hash、下载响应 header、ToolResult verified 字段。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补空内容导出失败 eval

**为什么要补**: 这是当前 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/file-export-verified-write.test.ts`。
- fixture 必须包含：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified。
- 断言必须读取：文件字节、hash、下载响应 header、ToolResult verified 字段。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补不存在 reportNum 的 PDF 下载失败 eval

**为什么要补**: 这是当前 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/file-export-verified-write.test.ts`。
- fixture 必须包含：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified。
- 断言必须读取：文件字节、hash、下载响应 header、ToolResult verified 字段。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 文件导出与PDF生成系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. Markdown 导出写入 output 文件

**状态**: 已有自动化覆盖

**项目依据**:
- 1. `src/lib/exporters.ts` 的浏览器 Blob 导出没有服务端 read-back hash，因为它不写盘。 2. `/api/cv/generate-pdf` 使用 Puppeteer，`/api/generate-cv-pdf` 使用 Playwright，两个入口仍并存。 3. `/api/generate-cv-pdf` 当前...
- - Markdown 导出能生成正确表格。 - 通用导出能写入原文件和 HTML 文件。 - 写入后 size 和 SHA-256 必须匹配。 - GET 下载必须返回 `X-Content-SHA256`。 - 报告 PDF 必须以 `%PDF` 开头。 - 报告 PDF 必须按 userId 读取，不能跨用户。 - Agent 文件导出缺少 hash 时...
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“Markdown 导出写入 output 文件”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Markdown 导出写入 output 文件”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Markdown 导出写入 output 文件”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. HTML 副本有 htmlSha256

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 1. 校验 `content` 必须是非空字符串。 2. 校验 `filename` 必须是字符串。 3. 根据 `format` 决定扩展名：`html`、`txt`、默认 `md`。 4. 清洗文件名：
- 5. 写入 `output/{filename}.{ext}`。 6. 同时生成一个 companion HTML 文件。 7. 对原文件和 HTML 文件做回读验证。 8. 返回下载路径、文件大小、SHA-256 和 `readBackVerified`。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“HTML 副本有 htmlSha256”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“HTML 副本有 htmlSha256”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“HTML 副本有 htmlSha256”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. GET 下载返回 Content-Length

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - Markdown 导出能生成正确表格。 - 通用导出能写入原文件和 HTML 文件。 - 写入后 size 和 SHA-256 必须匹配。 - GET 下载必须返回 `X-Content-SHA256`。 - 报告 PDF 必须以 `%PDF` 开头。 - 报告 PDF 必须按 userId 读取，不能跨用户。 - Agent 文件导出缺少 hash 时...
- 5. 写入 `output/{filename}.{ext}`。 6. 同时生成一个 companion HTML 文件。 7. 对原文件和 HTML 文件做回读验证。 8. 返回下载路径、文件大小、SHA-256 和 `readBackVerified`。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“GET 下载返回 Content-Length”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“GET 下载返回 Content-Length”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“GET 下载返回 Content-Length”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. PDF download 验证 bytes 和 hash

**状态**: 已有自动化覆盖

**项目依据**:
- 1. `src/lib/exporters.ts` 的浏览器 Blob 导出没有服务端 read-back hash，因为它不写盘。 2. `/api/cv/generate-pdf` 使用 Puppeteer，`/api/generate-cv-pdf` 使用 Playwright，两个入口仍并存。 3. `/api/generate-cv-pdf` 当前...
- 它把评估报告、投递记录、简历和 Agent 输出从产品内部带到用户手里。它最重要的设计不是下载按钮，而是成功证据：文件存在、大小非零、hash 可验证、PDF 文件头正确、失败时阻止成功提示。对求职产品来说，这些校验就是用户信任的一部分。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“PDF download 验证 bytes 和 hash”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“PDF download 验证 bytes 和 hash”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“PDF download 验证 bytes 和 hash”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent
- `src/__tests__/file-export-verified-write.test.ts`: verifies PDF bytes and SHA-256 before reporting a PDF download as ready

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 缺 sha256 不能 claim success

**状态**: 已有自动化覆盖

**项目依据**:
- 但没有 `sha256`，`evaluateTaskContractCompletion()` 不允许 claim success。
- 1. 检查 summary、skills、education 不能全空。 2. 读取 `templates/cv-template.html`。 3. 替换姓名、电话、邮箱、地点、LinkedIn、作品集等占位符。 4. 替换 summary、skills、experience、projects、education。 5. 修正字体路径为本地 `file:/...
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“缺 sha256 不能 claim success”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“缺 sha256 不能 claim success”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“缺 sha256 不能 claim success”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. readBackVerified 缺失工具返回失败

**状态**: 已有自动化覆盖

**项目依据**:
- 1. `src/lib/exporters.ts` 的浏览器 Blob 导出没有服务端 read-back hash，因为它不写盘。 2. `/api/cv/generate-pdf` 使用 Puppeteer，`/api/generate-cv-pdf` 使用 Playwright，两个入口仍并存。 3. `/api/generate-cv-pdf` 当前...
- 5. 写入 `output/{filename}.{ext}`。 6. 同时生成一个 companion HTML 文件。 7. 对原文件和 HTML 文件做回读验证。 8. 返回下载路径、文件大小、SHA-256 和 `readBackVerified`。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“readBackVerified 缺失工具返回失败”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“readBackVerified 缺失工具返回失败”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“readBackVerified 缺失工具返回失败”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 路径只能在允许目录

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 校验 `file` 参数存在。 2. 清洗路径，防止路径穿越。 3. 从 `output` 目录读取文件。 4. 计算 SHA-256。 5. 根据扩展名设置 MIME。 6. 返回文件内容，并在 header 里放入：
- 5. 写入 `output/{filename}.{ext}`。 6. 同时生成一个 companion HTML 文件。 7. 对原文件和 HTML 文件做回读验证。 8. 返回下载路径、文件大小、SHA-256 和 `readBackVerified`。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“路径只能在允许目录”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“路径只能在允许目录”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“路径只能在允许目录”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 空内容不能成功交付

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - Markdown 导出能生成正确表格。 - 通用导出能写入原文件和 HTML 文件。 - 写入后 size 和 SHA-256 必须匹配。 - GET 下载必须返回 `X-Content-SHA256`。 - 报告 PDF 必须以 `%PDF` 开头。 - 报告 PDF 必须按 userId 读取，不能跨用户。 - Agent 文件导出缺少 hash 时...
- 这解决的是用户之前遇到的典型问题：系统不能因为“工具调用成功”就告诉用户“文件已保存”。必须有 hash 证据。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“空内容不能成功交付”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“空内容不能成功交付”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“空内容不能成功交付”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. GET header hash 丢失

**状态**: 已有自动化覆盖

**项目依据**:
- 这些边界决定了后续优化方向：统一 PDF 引擎、统一 hash header、统一模板渲染和统一导出证据。
- - Markdown 导出能生成正确表格。 - 通用导出能写入原文件和 HTML 文件。 - 写入后 size 和 SHA-256 必须匹配。 - GET 下载必须返回 `X-Content-SHA256`。 - 报告 PDF 必须以 `%PDF` 开头。 - 报告 PDF 必须按 userId 读取，不能跨用户。 - Agent 文件导出缺少 hash 时...
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“GET header hash 丢失”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“GET header hash 丢失”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“GET header hash 丢失”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. Content-Length 与 bytes 不一致

**状态**: 已有自动化覆盖

**项目依据**:
- - HTTP 成功。 - `Content-Type` 包含 `application/pdf`。 - 响应 bytes 以 `%PDF` 开头。 - 响应 header 中的 `X-Content-SHA256` 与本地计算一致。 - 返回 `readBackVerified: true`。
- 这些入口服务不同场景，但共同目标是一致的：输出用户能使用的文件，并提供成功证据。
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“Content-Length 与 bytes 不一致”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Content-Length 与 bytes 不一致”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Content-Length 与 bytes 不一致”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: verifies PDF bytes and SHA-256 before reporting a PDF download as ready

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. download_report_pdf 只返回 URL

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- ### 9.1 `/api/cv/generate-pdf`
- ### 9.2 `/api/generate-cv-pdf`
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“download_report_pdf 只返回 URL”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“download_report_pdf 只返回 URL”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“download_report_pdf 只返回 URL”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. file_export contract 缺 file hash verified

**状态**: 已有自动化覆盖

**项目依据**:
- GET `/api/export-file?file=...` 会：
- 1. `src/lib/exporters.ts` 的浏览器 Blob 导出没有服务端 read-back hash，因为它不写盘。 2. `/api/cv/generate-pdf` 使用 Puppeteer，`/api/generate-cv-pdf` 使用 Playwright，两个入口仍并存。 3. `/api/generate-cv-pdf` 当前...
- 主要实现面：`src/app/api/export-file/route.ts`、`src/app/api/reports/[reportNum]/pdf/route.ts`、`src/lib/exporters.ts`、`src/lib/agent/tools/action/export-file.ts`。

**输入/fixture**:
- 正例：Markdown/HTML/PDF 导出请求、允许目录和可读回文件，用来验证“file_export contract 缺 file hash verified”的成功路径。
- 反例：空内容、路径越界、缺 sha256、Content-Length 不一致、只返回 URL，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：filePath、bytes、sha256、htmlSha256、Content-Length 和 readBackVerified；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 export-file route、exporters、generate-cv-pdf 和 download_report_pdf 工具 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“file_export contract 缺 file hash verified”对应动作，并记录请求、工具调用或页面状态。
3. 读取 文件字节、hash、下载响应 header、ToolResult verified 字段，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“file_export contract 缺 file hash verified”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 文件导出与PDF生成系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/file-export-verified-write.test.ts`
  - writes exported files and returns read-back size/hash evidence
  - requires file hash evidence before a file export task can claim success
  - rejects server export tool success when read-back hash evidence is absent
  - verifies PDF bytes and SHA-256 before reporting a PDF download as ready


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 文件导出与PDF生成系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
