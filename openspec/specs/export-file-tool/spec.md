## ADDED Requirements

### Requirement: 浏览器下载工具

Agent SHALL 拥有 `export_file` 工具，能将文本内容导出为文件并触发浏览器下载。

#### Scenario: 导出 Markdown

- **WHEN** LLM 调用 `export_file({ content: "...", filename: "报告", format: "md" })`
- **THEN** 浏览器下载一个 `报告.md` 文件
- **AND** 文件内容是传入的 markdown 文本

#### Scenario: 导出 HTML

- **WHEN** LLM 调用 `export_file({ content: "...", filename: "简历", format: "html" })`
- **THEN** 浏览器下载 `简历.html`

#### Scenario: 默认格式

- **WHEN** 不传 format 参数
- **THEN** 默认使用 md 格式

#### Scenario: 空内容保护

- **WHEN** content 为空字符串
- **THEN** 返回 `{ success: false, error: "内容不能为空" }`
