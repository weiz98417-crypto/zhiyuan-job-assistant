## ADDED Requirements

### Requirement: JD 上下文持久化展示

CV 页面右侧面板 SHALL 始终展示当前选中 JD 的摘要信息卡片，而非仅在匹配度面板出现时才可见。

#### Scenario: JD 信息卡片常驻

- **WHEN** 用户选中了一个 JD 进行配对
- **THEN** 右侧面板顶部 SHALL 持久显示 JD 信息卡片
- **AND** 卡片包含：公司名（带图标）、职位名、核心关键词（前 6 个，以 pill 形式展示）、当前匹配度百分比
- **AND** 提供"更换 JD"按钮重新选择

#### Scenario: 未选择 JD 时的引导

- **WHEN** 用户尚未选择任何 JD
- **THEN** JD 信息卡片 SHALL 显示引导提示："选择一个已评估的 JD 开始针对性优化"
- **AND** 下方显示 JD 选择下拉框

#### Scenario: JD 上下文在编辑区的联动

- **WHEN** 用户鼠标悬停在某 section 的"AI 优化"按钮上
- **THEN** tooltip SHALL 显示"针对 {公司名} — {职位名} 优化"

### Requirement: OptimizePanel JD 上下文展示

OptimizePanel 打开时 SHALL 在面板顶部展示当前 JD 摘要，slider 旁标注优化目标。

#### Scenario: 面板顶部 JD 摘要

- **WHEN** 用户打开某 section 的 OptimizePanel
- **THEN** 面板顶部 SHALL 显示一行摘要："优化目标：{公司} — {职位}"
- **AND** 如果没有选中 JD，显示"未选择目标 JD，将进行通用优化"

#### Scenario: Slider 参数标注

- **WHEN** 用户调整激进程度或关键词密度 slider
- **THEN** 每个 slider 下方 SHALL 显示提示文案
- **AND** 激进程度下方：如"针对 JD 要求进行措辞调整"
- **AND** 关键词密度下方：如"参考 JD 关键词：用户增长, A/B测试, LLM"

### Requirement: 参考简历辅助优化选择

OptimizePanel SHALL 展示可勾选的参考简历列表，用户可选择 0-N 份作为风格参考。

#### Scenario: 参考简历勾选区域

- **WHEN** OptimizePanel 打开且用户已导入参考简历
- **THEN** 在 slider 区域下方 SHALL 显示"参考风格（可选）"区域
- **AND** 列出所有参考简历名称（带 checkbox）
- **AND** 默认勾选 FTS5 自动匹配的前 3 份
- **AND** 如无参考简历，显示"[+ 导入参考简历]"引导链接

#### Scenario: 参考简历影响优化结果

- **WHEN** 用户勾选了参考简历并进行优化
- **THEN** 选中的参考简历对应 section 内容 SHALL 作为"风格参考"传入优化 API
- **AND** AI 在 prompt 中收到："参考以下优秀简历中同 section 的写法风格：[参考简历内容]"

### Requirement: 优化偏好记录

系统 SHALL 记录用户在 OptimizePanel 中对 variant 的 accept/reject 操作，供后续优化参考。

#### Scenario: Accept 操作记录

- **WHEN** 用户点击某个 variant 的"接受"按钮
- **THEN** 系统 SHALL 将 accept 事件写入 `optimization_preferences` 表
- **AND** 记录字段：section_id、variant_type（激进/保守/定向）、action="accept"、original_text、optimized_text

#### Scenario: Reject 操作记录

- **WHEN** 用户点击"关闭"或切换到其他 variant（隐式拒绝）
- **THEN** 已展示但未被接受的 variant SHALL 记录为 action="reject"
- **AND** 仅记录最近一次展示的 variant

#### Scenario: 偏好历史应用于后续优化

- **WHEN** 用户再次触发优化
- **THEN** 优化 prompt SHALL 附带最近 10 条偏好历史
- **AND** 格式为："用户之前✓接受了'{variant_type}'风格的优化 / ✗拒绝了'{variant_type}'风格的优化"
- **AND** LLM 可据此调整输出风格倾向

## MODIFIED Requirements

### Requirement: JD 配对优化

系统基于 JD 关键词自动建议简历修改，并 SHALL 在右上角持久化展示 JD 上下文。

#### Scenario: 关键词匹配分析

- **WHEN** 用户选择一个 JD 进行配对
- **THEN** 系统高亮 JD 中的关键词和技能要求
- **AND** 在简历中标注已覆盖和缺失的关键词
- **AND** 显示匹配度百分比
- **AND** JD 信息卡片在右侧面板顶部常驻显示

#### Scenario: AI 优化建议

- **WHEN** 用户点击"优化建议"
- **THEN** 系统逐条展示简历修改建议
- **AND** 每条建议说明原因（如"JD要求'大模型应用落地经验'，但你的简历中未体现"）
- **AND** 用户可逐条接受或拒绝
- **AND** 接受/拒绝操作被记录到偏好历史

#### Scenario: 自动关键词注入

- **WHEN** 用户接受关键词注入建议
- **THEN** 系统自然地将关键词融入简历中
- **AND** 注入后的文字保持可读性，不做 keyword stuffing
- **AND** 所有修改可预览和撤销
