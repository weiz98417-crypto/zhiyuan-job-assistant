## Why

当前 JD 管理页面（`/evaluate`）仅支持粘贴文本一种有效的输入方式（URL 自动抓取因国内网站反爬已降级为可选来源记录）。用户在实际求职场景中经常截图 BOSS 直聘、猎聘等 App 的职位页面，需要将这些截图转换为结构化 JD 文本。OCR 图片识别是 JD 录入的核心入口之一，缺少它将严重限制 JD 库的内容积累效率。

## What Changes

- 新增图片上传组件，支持拖拽/粘贴/点击上传单张或多张 JD 截图
- 集成智谱 GLM-4.6V-Flash 多模态模型进行 OCR 识别，提取结构化 JD 字段
- 批量上传队列：多张图片并行处理，每张显示独立状态（等待中 / 识别中 / 已完成 / 失败）
- 支持拖拽调整图片顺序（应对乱序上传）
- **逐张确认流程**：识别成功后显示可编辑的字段卡片（公司、职位、地点、薪资、技能要求、正文），用户确认/修改后保存到 JD 库
- **缺失字段提醒**：OCR 识别结果中标记为【缺失】的字段以黄色警告卡片提示用户补充
- 非 JD 图片检测：若识别结果无公司和职位字段，标记为"可能非 JD 图片"并提醒
- 新增 API 路由 `/api/ocr/jd-screenshot` 调用智谱 GLM-4.6V-Flash

## Capabilities

### New Capabilities

- `ocr-image-upload`: 图片上传组件（拖拽/粘贴/点击），预览、排序、删除、批量管理
- `ocr-api`: `/api/ocr/jd-screenshot` 路由，调用智谱 GLM-4.6V-Flash 提取 JD 结构化字段
- `ocr-confirmation-ui`: 逐张确认界面，可编辑字段卡片，缺失字段提醒

### Modified Capabilities

（无修改现有 capability — OCR 作为 JD 录入的新增渠道）

## Impact

- 新增依赖：无需额外 npm 包（浏览器 FileReader API + fetch）
- 新增 API 路由：`/api/ocr/jd-screenshot`
- 新增环境变量：`ZHIPU_API_KEY`（已提供）
- 评估页（`/evaluate`）新增"截图上传"输入模式 Tab
