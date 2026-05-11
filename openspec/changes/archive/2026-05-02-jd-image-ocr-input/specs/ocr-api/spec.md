# Spec: OCR API

## ADDED Requirements

### Requirement: JD 截图 OCR 识别

系统 SHALL 提供 `/api/ocr/jd-screenshot` POST 路由，接收 base64 图片数据，调用智谱 GLM-4.6V-Flash 多模态模型提取 JD 结构化字段。

#### Scenario: 成功识别 JD 信息

- **WHEN** 请求包含有效的 base64 图片数据
- **AND** 图片包含可识别的 JD 信息
- **THEN** 返回 JSON：`{ success: true, data: { company, role, location, salary, skills, body, isJD: true } }`

#### Scenario: 图片中无 JD 内容

- **WHEN** 请求的图片不包含 JD 信息（如风景照、自拍等）
- **THEN** 返回 `{ success: true, data: { isJD: false, reason: "未检测到职位描述信息" } }`
- **AND** HTTP 状态码为 200（非错误，只是内容不符合）

#### Scenario: API Key 未配置

- **WHEN** 环境变量 `ZHIPU_API_KEY` 未设置
- **THEN** 返回 `{ success: false, error: "OCR 服务未配置" }`
- **AND** HTTP 状态码为 500

#### Scenario: 智谱 API 调用失败

- **WHEN** 智谱 API 返回错误（如超时、限流）
- **THEN** 返回 `{ success: false, error: "OCR 识别失败: <具体原因>" }`
- **AND** HTTP 状态码为 502

### Requirement: 输入验证

系统 SHALL 验证请求中的图片数据，确保格式和大小合法。

#### Scenario: 请求体缺少图片数据

- **WHEN** 请求体中 `image` 字段为空
- **THEN** 返回 `{ success: false, error: "请提供图片数据" }`
- **AND** HTTP 状态码为 400

#### Scenario: 图片数据过大

- **WHEN** base64 解码后的图片超过 10MB
- **THEN** 返回 `{ success: false, error: "图片大小不能超过 10MB" }`
- **AND** HTTP 状态码为 400

#### Scenario: 不支持的图片格式

- **WHEN** 图片数据不以 `data:image/png`、`data:image/jpeg` 或 `data:image/webp` 开头
- **THEN** 返回 `{ success: false, error: "不支持的图片格式" }`
- **AND** HTTP 状态码为 400

### Requirement: 智谱 API 集成

系统 SHALL 使用 OpenAI-compatible 格式调用智谱 API，`model` 为 `glm-4.6v-flash`，`temperature: 0.1`（低温度确保稳定输出）。

#### Scenario: 正确构造 API 请求

- **WHEN** 系统调用智谱 API
- **THEN** 请求体包含 `model: "glm-4.6v-flash"`、`messages` 数组（system prompt + user 图片消息）、`temperature: 0.1`、`max_tokens: 2000`、`response_format: { type: "json_object" }`

#### Scenario: 解析 API 返回的 JSON

- **WHEN** 智谱 API 返回包含 JSON 的 content
- **THEN** 系统正确解析 `company`、`role`、`location`、`salary`、`skills`、`body`、`isJD` 字段
- **AND** 空字段用 `"【缺失】"` 填充
