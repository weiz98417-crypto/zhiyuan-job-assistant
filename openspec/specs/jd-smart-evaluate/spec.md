## MODIFIED Requirements

### Requirement: 流式 JD 评估

系统 SHALL 支持用户粘贴 JD（URL/文本）后，通过 `/api/evaluate/stream` 端点以 SSE 流式输出结构化评估报告。评估过程 SHALL 按 modes/zh/jianzhi.md 定义的 A-G 板块逐步执行，每板块独立生成并实时推送。

#### Scenario: 粘贴 JD 文本发起评估

- **WHEN** 用户在评估输入框粘贴 JD 文本
- **THEN** 系统 SHALL 调用 `POST /api/evaluate/stream` 建立 SSE 连接
- **AND** 通过 SSE 事件流逐步接收 block 内容并实时渲染
- **AND** 用户无需等待完整报告即可阅读已完成的板块

#### Scenario: 评估过程显示进度

- **WHEN** 流式评估正在进行中
- **THEN** 进度指示器 SHALL 反映真实的后端执行阶段（非固定时间间隔）
- **AND** 已完成板块可立即展开阅读
- **AND** 当前正在生成的板块以动画标记

#### Scenario: 评估失败重试

- **WHEN** 流式评估超时或中断
- **THEN** 显示友好错误提示和"重试"按钮
- **AND** 已完成板块的内容被保留

### Requirement: 自动评估触发

系统 SHALL 支持在用户粘贴 JD 文本后自动触发评估，无需手动点击按钮。

#### Scenario: 粘贴文本自动触发

- **WHEN** 用户在输入框粘贴 ≥50 字符的 JD 文本
- **THEN** 系统 SHALL 在 2 秒延迟后自动调用 `/api/evaluate/stream`
- **AND** 2 秒内用户可继续编辑，编辑后重置计时器

#### Scenario: URL 模式自动触发

- **WHEN** 用户粘贴一个 HTTP(S) URL
- **THEN** 系统 SHALL 在 1.5 秒延迟后自动触发 JD 提取 + 评估流程
- **AND** 延迟期间显示"正在获取 JD 内容..."状态
