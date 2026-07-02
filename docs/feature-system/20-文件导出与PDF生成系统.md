# 文件导出与 PDF 生成系统的产品构造

文件导出与 PDF 生成系统负责把纸鸢求职助手中的结果带出产品：投递记录导出为 Markdown，评估报告导出为 PDF，简历导出为可投递文件，Agent 生成的内容导出为带校验证据的文件。

这个系统的关键不是“能下载”，而是“能证明下载的东西真的生成了”。在求职产品里，导出失败但提示成功会直接伤害用户：用户可能拿着空文件、坏文件或旧文件去投递。纸鸢因此在导出链路里加入了文件大小、SHA-256、PDF 头校验和读回验证。

## 1. 产品定位

导出系统是纸鸢求职链路的交付层。

前面的模块负责生成内容：

- JD 评分生成报告。
- 简历工作台生成简历版本。
- 投递追踪沉淀 applications。
- Agent 生成分析、方案或文档。

导出系统负责把这些内容变成用户能保存、发送、打印或继续加工的文件。

完整位置如下：

```text
报告 / 简历 / 投递记录 / Agent 内容
  -> Markdown / HTML / PDF 渲染
  -> 写入 output 或直接返回 response
  -> 文件大小、hash、PDF 头校验
  -> 下载链接或浏览器下载
  -> Agent 成功提示必须带证据
```

## 2. 为什么不能只做普通下载

普通下载按钮只关心浏览器有没有触发下载。纸鸢需要关心的是更深一层：

| 风险 | 后果 | 系统处理 |
|---|---|---|
| 文件内容为空 | 用户以为已导出，实际没有可用材料 | 检查 size > 0 |
| 写入失败 | 下载链接指向不存在的文件 | 写入后回读 |
| 内容被截断 | 文件能打开但不完整 | 比较 size 和 SHA-256 |
| PDF 生成失败 | 返回 HTML 错误页或空文件 | 校验 `%PDF` 文件头 |
| Agent 工具误报成功 | 用户收到“已导出”但没有文件证据 | task contract 要求 hash evidence |
| 文件名包含危险字符 | 路径穿越或非法文件名 | 文件名清洗 |

因此，文件导出系统本质上是一个“可验证交付系统”。

## 3. 系统入口总览

项目里有多条导出链路。

| 导出类型 | 入口 | 关键文件 |
|---|---|---|
| 投递记录 Markdown | 追踪页、设置页 | `src/lib/exporters.ts` |
| 通用文件导出 | POST/GET `/api/export-file` | `src/app/api/export-file/route.ts` |
| 评估报告 PDF | GET `/api/reports/[reportNum]/pdf` | `src/app/api/reports/[reportNum]/pdf/route.ts` |
| 简历 PDF 旧入口 | POST `/api/cv/generate-pdf` | `src/app/api/cv/generate-pdf/route.ts` |
| 简历 PDF 当前入口 | POST `/api/generate-cv-pdf` | `src/app/api/generate-cv-pdf/route.ts` |
| Agent 文件导出工具 | `export_file` | `src/lib/agent/tools/action/export-file.ts` |
| Agent 报告 PDF 工具 | `download_report_pdf` | `src/lib/agent/tools/action/download-report-pdf.ts` |
| 导出成功契约 | task contract | `src/lib/agent/task-contract.ts` |
| 回归测试 | verified writes | `src/__tests__/file-export-verified-write.test.ts` |

这些入口服务不同场景，但共同目标是一致的：输出用户能使用的文件，并提供成功证据。

## 4. 投递记录 Markdown 导出

`src/lib/exporters.ts` 提供 `exportApplicationsMD()`。

它把 `Application[]` 转成 Markdown 表格：

```text
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

每条记录写入：

- `num`
- `date`
- `company`
- `role`
- `score`
- `STATUS_LABELS[status]`
- `pdfGenerated`
- `reportPath`
- `notes`

它还提供 `downloadAsFile()`，使用浏览器 Blob 生成下载：

```text
new Blob([content], { type: "text/markdown;charset=utf-8" })
URL.createObjectURL(blob)
a.click()
URL.revokeObjectURL(url)
```

这个导出主要用于投递追踪页和设置页，是本地浏览器导出，不经过服务端写盘。

## 5. 通用文件导出 API

通用导出 API 是 `src/app/api/export-file/route.ts`。

POST 请求接收：

```json
{
  "content": "# Report",
  "filename": "report",
  "format": "md"
}
```

它会：

1. 校验 `content` 必须是非空字符串。
2. 校验 `filename` 必须是字符串。
3. 根据 `format` 决定扩展名：`html`、`txt`、默认 `md`。
4. 清洗文件名：

```text
filename.replace(/[\\/:*?"<>|]/g, "-").replace(/\.\./g, "").trim()
```

5. 写入 `output/{filename}.{ext}`。
6. 同时生成一个 companion HTML 文件。
7. 对原文件和 HTML 文件做回读验证。
8. 返回下载路径、文件大小、SHA-256 和 `readBackVerified`。

返回成功数据包含：

| 字段 | 含义 |
|---|---|
| `filename` | 原格式文件名 |
| `downloadUrl` | 原文件下载地址 |
| `htmlDownloadUrl` | HTML 文件下载地址 |
| `size` | 原文件字节数 |
| `sha256` | 原文件 SHA-256 |
| `htmlSize` | HTML 字节数 |
| `htmlSha256` | HTML SHA-256 |
| `readBackVerified` | 是否通过回读校验 |

如果回读失败，接口返回：

```text
导出文件写入后回读校验失败，已阻止成功提示
```

这句话非常关键：系统不是“尽力写入后就算成功”，而是“写入后能回读并校验才算成功”。

## 6. Markdown 转 HTML

通用导出 API 内部实现了 `mdToHtml()`。

它支持：

- 标题 `#`、`##`、`###`
- 加粗、斜体、行内代码、链接
- 表格
- 引用
- 无序列表
- 有序列表
- 代码块
- 分割线

生成的 HTML 文档会带基础样式：

- 中文字体优先。
- 表格边框和表头背景。
- 代码块背景。
- 打印样式。

这个 HTML 不是为了替代专业文档排版，而是为了让 Markdown 导出有一个可打开、可打印的伴随版本。

## 7. 通用导出下载 GET

GET `/api/export-file?file=...` 会：

1. 校验 `file` 参数存在。
2. 清洗路径，防止路径穿越。
3. 从 `output` 目录读取文件。
4. 计算 SHA-256。
5. 根据扩展名设置 MIME。
6. 返回文件内容，并在 header 里放入：

```text
Content-Type
Content-Disposition
Content-Length
X-Content-SHA256
```

这个 header 设计是为了让 Agent 或测试能验证下载结果，而不是只看到 HTTP 200。

## 8. 评估报告 PDF

评估报告 PDF 入口是 `src/app/api/reports/[reportNum]/pdf/route.ts`。

它的流程是：

```text
GET /api/reports/{reportNum}/pdf
  -> getCurrentUser()
  -> getDataRepositories().reports.get(reportNum, user.userId)
  -> buildReportHtml(report)
  -> Playwright Chromium 渲染 PDF
  -> 校验 PDF 非空且以 %PDF 开头
  -> 返回 application/pdf，附带 X-Content-SHA256
```

`buildReportHtml()` 会把报告中的 A-G 模块渲染出来：

| key | 标题 |
|---|---|
| a | A 职位概览 |
| b | B 简历匹配 |
| c | C 职级与策略 |
| d | D 薪资与市场 |
| e | E 定制化方案 |
| f | F 面试准备 |
| g | G 合法性与风险 |

报告 PDF 不是简单把页面截图成 PDF，而是重新构造适合 A4 打印的 HTML：

- A4 页面。
- 页边距。
- 页码。
- 表格换行。
- markdown 内容安全转换。
- 标题、元信息、关键词。

如果 PDF 为空或文件头不是 `%PDF`，接口返回：

```text
PDF 生成后校验失败，已阻止空文件下载
```

## 9. 简历 PDF

项目里有两个简历 PDF 入口。

### 9.1 `/api/cv/generate-pdf`

这个入口读取 `templates/cv-template.html`，把 `cvData` 填入模板，再用 Puppeteer 渲染 PDF。

它支持：

- 从 `versions[activeVersion].sections` 提取 sections。
- 把 Markdown 转成基础 HTML。
- 写入临时 HTML 文件。
- Puppeteer 打开临时文件。
- 生成 A4 PDF。
- 清理临时文件。

这个入口偏早期实现，主要基于模板占位符替换。

### 9.2 `/api/generate-cv-pdf`

这个入口是更完整的简历 PDF 生成链路。

它接收：

```json
{
  "sections": [
    { "id": "summary", "title": "summary", "content": "..." }
  ],
  "template": "clean",
  "targetCompany": "Acme",
  "profile": {
    "fullName": "...",
    "email": "...",
    "phone": "..."
  }
}
```

它会：

1. 检查 summary、skills、education 不能全空。
2. 读取 `templates/cv-template.html`。
3. 替换姓名、电话、邮箱、地点、LinkedIn、作品集等占位符。
4. 替换 summary、skills、experience、projects、education。
5. 修正字体路径为本地 `file://`。
6. 按模板注入 CSS：`clean`、`modern`、`compact`。
7. 做 ATS 文本规范化：

```text
— -> -
“” -> "
‘’ -> '
… -> ...
移除零宽字符
```

8. 用 Playwright Chromium 生成 PDF。
9. 返回 `application/pdf`。

这条链路体现了简历 PDF 的特殊要求：它不仅要能下载，还要尽量对 ATS 友好。

## 10. Agent 导出工具

Agent 工具包括：

- `export_file`
- `download_report_pdf`

它们不是直接在聊天里说“已导出”，而是要走工具治理和任务契约。

`src/__tests__/file-export-verified-write.test.ts` 里明确验证：

```text
file_export 任务必须包含：
- export generated
- file exists
- file size is non-zero
- file hash verified
```

如果工具返回：

```json
{
  "filename": "report.md",
  "size": 120,
  "readBackVerified": true
}
```

但没有 `sha256`，`evaluateTaskContractCompletion()` 不允许 claim success。

这解决的是用户之前遇到的典型问题：系统不能因为“工具调用成功”就告诉用户“文件已保存”。必须有 hash 证据。

## 11. PDF 下载工具的校验

`download_report_pdf` 会先读取报告详情，再请求：

```text
/api/reports/{reportNum}/pdf
```

测试中验证了几个条件：

- HTTP 成功。
- `Content-Type` 包含 `application/pdf`。
- 响应 bytes 以 `%PDF` 开头。
- 响应 header 中的 `X-Content-SHA256` 与本地计算一致。
- 返回 `readBackVerified: true`。

这说明 PDF 下载不是只看链接存在，而是验证文件内容本身。

## 12. 文件名与路径安全

导出系统做了两层文件名保护。

POST 写文件时：

```text
filename.replace(/[\\/:*?"<>|]/g, "-").replace(/\.\./g, "").trim()
```

GET 读文件时：

```text
file.replace(/\.\.\/|\\/g, "")
```

这防止用户或 Agent 通过文件名写到 `output` 目录以外的位置。

评估报告 PDF 文件名也会替换 Windows 非法字符：

```text
report-{report_num}-{company}-{role}.pdf
```

再把 `\ / : * ? " < > |` 替换成 `-`。

## 13. 当前边界

导出系统当前具备比较强的校验，但仍有边界：

1. `src/lib/exporters.ts` 的浏览器 Blob 导出没有服务端 read-back hash，因为它不写盘。
2. `/api/cv/generate-pdf` 使用 Puppeteer，`/api/generate-cv-pdf` 使用 Playwright，两个入口仍并存。
3. `/api/generate-cv-pdf` 当前返回 PDF bytes，但没有像报告 PDF 一样返回 `X-Content-SHA256`。
4. 通用 Markdown 转 HTML 是轻量解析器，不是完整 Markdown 引擎。
5. 通用导出写入 `output` 目录，适合本地项目和 Agent 工具，不等同于云对象存储。
6. 简历 PDF 的模板质量依赖 `templates/cv-template.html`。

这些边界决定了后续优化方向：统一 PDF 引擎、统一 hash header、统一模板渲染和统一导出证据。

## 14. 常见失败模式

| 失败模式 | 当前处理 |
|---|---|
| `content` 为空 | `/api/export-file` 返回 400 |
| `filename` 为空或非法 | 返回 400 或清洗后校验失败 |
| 写入后回读不一致 | 返回 500，并阻止成功提示 |
| GET 文件不存在 | 返回 404 |
| 报告不存在 | `/api/reports/[reportNum]/pdf` 返回 404 |
| 未登录下载报告 PDF | 返回 401 |
| Playwright Chromium 找不到 | PDF 生成失败，返回错误 |
| PDF 内容不是 `%PDF` | 返回 500，阻止空文件下载 |
| 简历内容为空 | `/api/generate-cv-pdf` 返回 400 |
| CV 模板缺失 | 返回 500 |
| Agent 工具缺少 hash | 工具结果被判定为失败 |

这些失败处理体现了导出系统的产品原则：宁可明确失败，也不能让用户误以为已经拿到可用文件。

## 15. 验证依据

相关项目文件包括：

- `src/lib/exporters.ts`
- `src/app/api/export-file/route.ts`
- `src/app/api/reports/[reportNum]/pdf/route.ts`
- `src/app/api/cv/generate-pdf/route.ts`
- `src/app/api/generate-cv-pdf/route.ts`
- `src/lib/agent/tools/action/export-file.ts`
- `src/lib/agent/tools/action/download-report-pdf.ts`
- `src/lib/agent/task-contract.ts`
- `src/__tests__/file-export-verified-write.test.ts`
- `templates/cv-template.html`
- `generate-pdf.mjs`

验证重点包括：

- Markdown 导出能生成正确表格。
- 通用导出能写入原文件和 HTML 文件。
- 写入后 size 和 SHA-256 必须匹配。
- GET 下载必须返回 `X-Content-SHA256`。
- 报告 PDF 必须以 `%PDF` 开头。
- 报告 PDF 必须按 userId 读取，不能跨用户。
- Agent 文件导出缺少 hash 时不能宣称成功。
- 简历 PDF 对空内容、模板缺失和浏览器缺失有明确错误。

## 16. 产品总结

文件导出与 PDF 生成系统是纸鸢求职助手的结果交付层。

它把评估报告、投递记录、简历和 Agent 输出从产品内部带到用户手里。它最重要的设计不是下载按钮，而是成功证据：文件存在、大小非零、hash 可验证、PDF 文件头正确、失败时阻止成功提示。对求职产品来说，这些校验就是用户信任的一部分。
