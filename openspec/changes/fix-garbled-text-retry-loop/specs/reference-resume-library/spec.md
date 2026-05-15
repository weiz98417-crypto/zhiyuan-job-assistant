## MODIFIED Requirements

### Requirement: 参考简历导入

系统 SHALL 支持用户通过 PDF 上传、Word 文档上传、图片上传(OCR 解析)或文本粘贴导入优秀简历作为参考。Word 文档导入 SHALL 包含编码容错机制。

#### Scenario: PDF 上传导入

- **WHEN** 用户上传 PDF 格式的参考简历
- **THEN** 后端先尝试 pdf-parse 提取文本,失败时回退到智谱多模态 OCR 识别
- **AND** AI 解析文本内容,提取为结构化 sections(Summary/Experience/Projects/Skills/Education)
- **AND** 返回解析结果供用户确认和编辑
- **AND** 确认后写入 `reference_resumes` 表

#### Scenario: Word 文档导入(正常编码)

- **WHEN** 用户上传 .docx 格式的参考简历,且文档编码为 UTF-8(标准 OOXML)
- **THEN** 后端使用 mammoth 提取文本内容
- **AND** 提取的文本经 `isGarbledText()` 检测为正常
- **AND** AI 解析为结构化 sections
- **AND** 返回解析结果供用户确认和编辑

#### Scenario: Word 文档导入(编码异常 fallback)

- **WHEN** 用户上传 .docx 格式的参考简历,且 mammoth 提取的文本被 `isGarbledText()` 检测为乱码
- **THEN** 后端自动 fallback 到 Qwen-Long AI 提取(与 .doc/.pdf 相同路径)
- **AND** 使用原始文件 buffer 调用 `extractViaQwenLong(buffer, filename)`
- **AND** Qwen-Long 提取成功后走正常 AI 解析流程
- **AND** Qwen-Long 也失败时返回明确错误:"文档编码不兼容,无法提取文本。请尝试:1)将文档另存为 UTF-8 编码的 .txt 文件 2)直接粘贴文本内容 3)发送截图"

#### Scenario: 图片 OCR 导入

- **WHEN** 用户上传简历截图(PNG/JPG/WebP)
- **THEN** 后端调用智谱多模态模型识别文字内容并结构化提取
- **AND** 返回解析结果供用户确认和编辑

#### Scenario: 文本粘贴导入

- **WHEN** 用户粘贴简历全文文本
- **THEN** 系统通过 AI 自动识别分段并解析为结构化 sections
- **AND** 自动填充 sections 结构

#### Scenario: 导入后手动修正

- **WHEN** AI 解析结果存在错漏
- **THEN** 用户可手动编辑每个 section 的内容
- **AND** 编辑后重新生成 FTS5 索引文本
