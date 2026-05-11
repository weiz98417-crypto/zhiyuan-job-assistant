## Why

当前简历管理页面只能手动输入各栏位内容，用户无法直接上传已有简历文件（PDF/Word/图片/Markdown）自动填充。Agent Chat 能上传图片但不会识别简历内容并路由到 Resume Agent 进行解析填入。

## What Changes

### 简历文件上传 API
- `POST /api/cv/import` — 接受文件上传（jpg/png/pdf/docx/md/txt），自动识别文件类型
- PDF → pdf-parse 提取文字
- Word → mammoth 提取文字
- 图片 → DeepSeek vision OCR
- Markdown/Text → 直接读取
- 提取后调用 DeepSeek AI 解析为 CV 五栏位结构（summary/experience/projects/education/skills）

### CV 管理页面上传入口
- `/cv` 页面新增上传按钮（支持拖拽）
- 上传后显示解析进度
- 解析完成后自动填入对应栏位
- 用户可编辑修正后再保存

### Agent Chat 简历识别路由
- Agent Chat 文件上传检测到简历文件时
- 调用 `/api/cv/import` 解析
- 自动路由到 Resume Agent
- 展示解析结果，用户确认后写入简历

## Capabilities

### New Capabilities
- `cv-file-import`: 简历文件上传、多格式解析、AI 结构化提取
- `cv-upload-ui`: CV 页面上传交互（拖拽/选择文件、进度展示、结果填入）
- `agent-resume-routing`: Agent Chat 简历文件识别 + 路由到 Resume Agent

### Modified Capabilities
- `agent-resume-subagent`: Resume Agent 增加文件上传后的解析结果处理能力

## Impact

- **新增文件**: `api/cv/import/route.ts`, CV 页面 upload 组件
- **修改文件**: `cv/page.tsx`（上传入口），`agent/page.tsx`（简历文件检测），resume-agent prompt
- **依赖**: mammoth、pdf-parse（已安装）、DeepSeek vision API
- **API**: 新增 `POST /api/cv/import`，接受 multipart/form-data
