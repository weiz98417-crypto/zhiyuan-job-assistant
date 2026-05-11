## Context

CV 管理页面当前为纯手动输入，无文件上传入口。Agent Chat 支持图片上传（OCR JD）但不识别简历文件。

## Goals
- 支持 5 种格式上传：图片(jpg/png)、PDF、Word(.docx)、Markdown(.md)、纯文本(.txt)
- 自动识别文件类型，用对应方式提取文字
- AI 解析为 `{ summary, experience, projects, education, skills }` 五栏位结构
- CV 页面：上传 → 解析 → 填入 → 编辑 → 保存
- Agent Chat：上传简历文件 → OCR/解析 → 路由 Resume Agent → 展示 → 确认写入

## Decisions

### Decision 1: 文件处理链路

```
upload → 检测mime/扩展名 → 提取文字 → AI解析 → 返回sections
         ↓ image         ↓ pdf      ↓ docx    ↓ md/txt
         base64+OCR      pdf-parse  mammoth   raw text
```

### Decision 2: OCR 方案

使用 DeepSeek vision API（multimodal），发送 base64 图片 + "提取所有文字" prompt。

### Decision 3: CV 页面 UI

在现有编辑区上方增加 "导入简历" 按钮，点击弹出文件选择器。选中后显示 "解析中..." 加载态，完成后自动填入各栏位。用户可编辑后再保存。

### Decision 4: Agent Chat 集成

复用现有图片上传 UI（Ctrl+V / 文件选择器）。当用户上传的文件被识别为简历格式（通过内容特征判断：含"简历/工作经历/教育背景/技能"等关键词），自动调用 `/api/cv/import` 解析，并将结果路由到 Resume Agent。

## Architecture

```
CV Page:                  Agent Chat:
[上传按钮]                [文件上传]
    ↓                         ↓
POST /api/cv/import      POST /api/cv/import
    ↓                         ↓
AI extracts sections      AI extracts sections
    ↓                         ↓
填入编辑框                路由 Resume Agent
用户确认保存              展示解析结果
                         用户确认 → 写入 CV
```
