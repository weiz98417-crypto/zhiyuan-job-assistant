## ADDED Requirements

### Requirement: 截图作为 Phase 0 输入

`POST /api/evaluate/stream` SHALL 接受 `images` 参数（base64 图片数组，最多 5 张），在 Phase 0 阶段通过多模态模型逐张识别 JD 文本，识别进度通过 SSE 推送。

#### Scenario: 接受截图参数并开始 OCR

- **WHEN** 客户端 POST `{ images: ["data:image/png;base64,...", ...], language: "zh" }` 到 `/api/evaluate/stream`
- **AND** `images` 数组长度在 1-5 之间
- **THEN** 服务端 SHALL 推送 `phase` 事件，phase 值为 `extracting_ocr`，source 为 `ocr`，total 为图片数量
- **AND** 开始逐张调用多模态模型识别

#### Scenario: 超过 5 张截图拒绝

- **WHEN** 客户端传入超过 5 张图片
- **THEN** 服务端 SHALL 返回 HTTP 400
- **AND** 错误信息为「最多支持 5 张截图」

#### Scenario: 不支持的文件格式

- **WHEN** 图片 MIME 类型不是 `image/png`、`image/jpeg` 或 `image/webp`
- **THEN** 服务端 SHALL 跳过该图片，继续处理其余
- **AND** 推送 `ocr_progress` 事件中标注该图片为跳过状态

### Requirement: OCR 进度可见

服务端 SHALL 在每张截图识别完成后推送 `ocr_progress` 事件，包含当前进度和已提取的部分 JD 文本。

#### Scenario: 逐张推送进度

- **WHEN** 服务端正在逐张识别截图
- **THEN** 每完成一张 SHALL 推送 `{ type: "ocr_progress", current: N, total: M }`
- **AND** 至少每完成一张推送一次
- **AND** 识别出的部分文本 SHALL 在 `partialText` 字段中累积

#### Scenario: OCR 完成后进入评估

- **WHEN** 所有截图识别完成
- **THEN** 服务端 SHALL 合并所有识别出的 body 字段为完整 JD 文本
- **AND** 推送 `phase` 事件，phase 值为 `jd_extracted`，附带提取到的 company 和 role
- **AND** 自动进入 Phase 0.5（archetype 检测）

### Requirement: 多模态模型选择

OCR 识别 SHALL 使用智谱 GLM-4V Flash（`glm-4.6v-flash`）模型，与现有 `ocr/jd-screenshot` 端点相同。

#### Scenario: 智谱 API 不可用

- **WHEN** `ZHIPU_API_KEY` 未配置或 API 调用失败
- **THEN** 服务端 SHALL 返回明确错误「OCR 服务未配置，请使用文本或 URL 输入」
- **AND** 不进入 A-G 评估流程

#### Scenario: 单张图片识别失败不阻断整体

- **WHEN** 某张图片的 OCR 调用失败（超时/API 错误）
- **THEN** 该图片 SHALL 在 `ocr_progress` 事件中被标记为失败
- **AND** 后续图片继续识别
- **AND** 最终合并时跳过失败图片的空白结果

### Requirement: 输入方式优先级

当客户端同时传入多种输入（images、jdText、jdUrl）时，服务端 SHALL 按优先级选择：images > jdUrl > jdText。

#### Scenario: 同时传入截图和文本

- **WHEN** 客户端同时传入 `images` 和 `jdText`
- **THEN** 服务端 SHALL 优先使用 `images` 进行 OCR 识别
- **AND** 忽略 `jdText` 和 `jdUrl`

#### Scenario: 仅传入 JD 文本

- **WHEN** 客户端仅传入 `jdText`（无 images 和 jdUrl）
- **THEN** 服务端 SHALL 跳过 OCR 和 URL 抓取
- **AND** 直接使用 jdText 进入 archetype 检测
