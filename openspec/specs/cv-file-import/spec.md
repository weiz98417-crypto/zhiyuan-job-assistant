## ADDED Requirements

### Requirement: 简历文件上传解析 API

系统 SHALL 提供 `POST /api/cv/import` 端点，接受简历文件上传并自动解析为结构化 CV 栏位。

#### Scenario: 多格式支持

- **WHEN** 用户上传文件
- **THEN** 系统 SHALL 根据 MIME 类型和扩展名自动选择提取方式：
  - 图片(jpg/png/webp) → OCR 识别
  - PDF → pdf-parse 提取文字
  - Word(.docx) → mammoth 提取文字
  - Markdown(.md) / 纯文本(.txt) → 直接读取
- **AND** 不支持的文件格式返回错误提示

#### Scenario: AI 结构化解析

- **WHEN** 文字提取完成
- **THEN** 系统 SHALL 调用 AI 将文本解析为五个栏位：
  - summary（个人概述）
  - experience（工作经历）
  - projects（项目经验）
  - education（教育背景）
  - skills（技能）
- **AND** 无内容栏位返回空字符串
- **AND** 不编造原文中不存在的信息

#### Scenario: 文件大小限制

- **WHEN** 用户上传超过 10MB 的文件
- **THEN** SHALL 返回 400 错误："文件大小超过10MB限制"

#### Scenario: OCR 失败处理

- **WHEN** 图片 OCR 识别失败
- **THEN** SHALL 返回 500 错误："OCR 识别失败"
