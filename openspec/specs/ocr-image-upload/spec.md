# Spec: OCR Image Upload

## ADDED Requirements

### Requirement: 图片上传入口

系统 SHALL 在评估页面（`/evaluate`）提供"截图识别"输入模式 Tab，支持拖拽、粘贴、点击三种方式上传 JD 截图。

#### Scenario: 拖拽上传

- **WHEN** 用户拖拽图片文件到上传区域
- **THEN** 图片添加到预览队列
- **AND** 显示缩略图和文件名

#### Scenario: 粘贴上传

- **WHEN** 用户在页面任意位置按 Ctrl+V 粘贴剪贴板中的图片
- **AND** 当前处于"截图识别"模式
- **THEN** 图片添加到预览队列

#### Scenario: 点击上传

- **WHEN** 用户点击上传区域
- **THEN** 打开系统文件选择器，仅接受 image/png、image/jpeg、image/webp 格式

#### Scenario: 不支持的格式

- **WHEN** 用户尝试上传非图片文件
- **THEN** 显示提示"仅支持 PNG、JPG、WebP 格式的图片"

### Requirement: 批量图片队列

系统 SHALL 支持批量上传 1-10 张图片，以队列形式展示，支持排序和删除。

#### Scenario: 队列预览

- **WHEN** 用户添加多张图片
- **THEN** 以缩略图网格展示所有待处理图片
- **AND** 每张图片显示序号和删除按钮

#### Scenario: 拖拽排序

- **WHEN** 用户拖拽队列中的图片调整位置
- **THEN** 图片顺序更新
- **AND** 序号重新排列

#### Scenario: 删除队列中的图片

- **WHEN** 用户点击某张图片的删除按钮
- **THEN** 该图片从队列移除
- **AND** 剩余图片序号重新排列

#### Scenario: 超出数量限制

- **WHEN** 用户尝试添加超过 10 张图片
- **THEN** 显示提示"最多上传 10 张图片"

### Requirement: 批量识别触发

系统 SHALL 提供"开始识别"按钮，点击后并行处理队列中的所有图片。

#### Scenario: 触发识别

- **WHEN** 用户点击"开始识别"
- **THEN** 所有图片进入"识别中"状态
- **AND** 每张图片独立调用 OCR API
- **AND** 按钮变为禁用状态，显示识别进度（如 "3/5 完成"）

#### Scenario: 识别成功

- **WHEN** 某张图片 OCR 识别成功
- **THEN** 该图片状态变为 ✅（完成）
- **AND** 提取的结构化数据暂存

#### Scenario: 识别失败

- **WHEN** 某张图片 OCR 识别失败（网络错误、API 错误等）
- **THEN** 该图片状态变为 ❌（失败）
- **AND** 显示失败原因
- **AND** 提供"重试"按钮

#### Scenario: 空队列触发

- **WHEN** 队列为空时用户点击"开始识别"
- **THEN** 按钮不可点击，显示提示"请先上传 JD 截图"
