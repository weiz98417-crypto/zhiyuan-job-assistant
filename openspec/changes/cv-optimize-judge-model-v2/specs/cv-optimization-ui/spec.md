# Delta Spec: CV Optimization UI

## ADDED Requirements

### Requirement: 操作类型按钮选择

OptimizePanel SHALL 提供 4 个离散操作按钮，用户单选决定优化方向。

#### Scenario: 操作按钮展示

- **WHEN** OptimizePanel 打开
- **THEN** SHALL 显示 4 个操作按钮：全面优化、STAR 重组、量化增强、关键词注入
- **AND** 默认选中「全面优化」
- **AND** 按钮 SHALL 以选中态/非选中态视觉区分

#### Scenario: 选择操作类型

- **WHEN** 用户点击某个操作按钮
- **THEN** 该按钮 SHALL 进入选中态，其他按钮取消选中
- **AND** 选中后 SHALL 不影响 Effort 和其他设置

### Requirement: Effort 5 档强度选择

OptimizePanel SHALL 用 5 档点选替代连续滑条控制改写强度。

#### Scenario: Effort 选择器展示

- **WHEN** OptimizePanel 打开
- **THEN** SHALL 显示 5 个点选按钮：温和、保守、适中、大刀、重写
- **AND** 默认选中「适中」
- **AND** 每档下方 SHALL 显示简要描述文案（如「仅润色措辞」「大胆推断量化」）

#### Scenario: 切换 Effort 档位

- **WHEN** 用户点击不同档位
- **THEN** 选中态切换
- **AND** 底部描述文案 SHALL 随之更新
- **AND** Effort 切换 SHALL NOT 影响 Operation 选择

### Requirement: JD / Reference 上下文卡片

OptimizePanel SHALL 在面板中展示当前选中的 JD 和参考简历摘要，标明其影响范围。

#### Scenario: JD 上下文展示

- **WHEN** 用户已选择目标 JD 且打开 OptimizePanel
- **THEN** SHALL 显示 JD 信息行：「JD：{职位} @ {公司} — 影响：优先强化 {关键词}」
- **AND** 无 JD 时 SHALL 隐藏 JD 信息行

#### Scenario: Reference 上下文展示

- **WHEN** 用户已勾选参考简历且打开 OptimizePanel
- **THEN** SHALL 显示参考信息行：「参考：{N} 份优秀简历 — 影响：句式节奏、动词选择、量化密度」
- **AND** 无参考时 SHALL 隐藏参考信息行

### Requirement: XX 占位符交互

优化方案中的 XX 占位符 SHALL 以高亮样式渲染，支持用户点击编辑。

#### Scenario: 占位符渲染

- **WHEN** 方案内容中包含 `[XX]` 或 `[XX: 说明]` 格式的占位符
- **THEN** 占位符 SHALL 以黄色背景高亮显示（`bg-amber-200 dark:bg-amber-800`）
- **AND** 悬停时 SHALL 显示 tooltip：「点击填入真实数据」

#### Scenario: 占位符编辑

- **WHEN** 用户点击占位符
- **THEN** 占位符 SHALL 变为可编辑的 inline input
- **AND** 用户输入值后按 Enter 确认，占位符替换为用户输入的文本
- **AND** 编辑后占位符高亮样式 SHALL 移除

### Requirement: 追问卡片交互

Effort 4-5 且追问开关开启时，SHALL 显示追问卡片供用户补充信息。

#### Scenario: 追问卡片展示

- **WHEN** 用户点击「生成方案」且 Effort ≥ 4 且追问开关开启
- **THEN** SHALL 显示追问卡片，包含 2-4 个信息补充问题
- **AND** 每个问题 SHALL 包含选项（如单选项）或文本输入框
- **AND** 卡片底部 SHALL 显示「跳过追问」和「提交并生成」两个按钮

#### Scenario: 跳过追问

- **WHEN** 用户点击「跳过追问」
- **THEN** 追问卡片 SHALL 关闭
- **AND** 系统 SHALL 以 XX 占位符模式生成方案
- **AND** loading 状态 SHALL 紧接着显示

#### Scenario: 提交追问答案

- **WHEN** 用户回答追问并点击「提交并生成」
- **THEN** 答案 SHALL 作为 questionAnswers 传入 optimize-section API
- **AND** 追问卡片 SHALL 关闭
- **AND** loading 状态 SHALL 紧接着显示

### Requirement: 方案差异化展示

方案展示 SHALL 明确区分定向方案和通用方案。

#### Scenario: 有 JD 时双方案展示

- **WHEN** 有 JD 且生成完成
- **THEN** SHALL 展示方案 A（定向）和方案 B（通用）两个方案
- **AND** 方案 A SHALL 标记「定向·针对{职位}」
- **AND** 方案 B SHALL 标记「通用·对照参考」
- **AND** 方案 A SHALL 默认位于方案 B 上方

#### Scenario: 无 JD 时单方案展示

- **WHEN** 无 JD 且生成完成
- **THEN** SHALL 展示 1 个方案
- **AND** 方案 SHALL 标记「通用优化」

### Requirement: 机制开关

OptimizePanel SHALL 提供 XX 占位符和追问模式的独立开关。

#### Scenario: 开关展示

- **WHEN** OptimizePanel 打开
- **THEN** SHALL 在 Effort 区域下方显示两个 checkbox 开关
- **AND** 「允许 AI 推断量化数据（XX 占位）」SHALL 默认勾选
- **AND** 「先追问再优化」SHALL 默认不勾选

#### Scenario: 追问开关仅在高效力时可用

- **WHEN** Effort < 4
- **THEN** 「先追问再优化」开关 SHALL 显示为禁用态（灰色）
- **AND** 悬停时 SHALL 显示 tooltip：「Effort 4-5 时可用」

## MODIFIED Requirements

### Requirement: AI 定向优化面板

简历页面 SHALL 提供 AI 定向优化面板，用户通过操作按钮选择优化方向、通过 Effort 选择器控制改写强度，AI 生成多个改写方案供用户选择。

#### Scenario: 选择 JD 触发优化

- **WHEN** 用户选择已保存的 JD 并点击「AI 优化」按钮
- **THEN** AI 分析 JD 关键要求并以 JD 作为内容滤网
- **AND** 以方案对比视图展示优化结果（定向版 vs 通用版）
- **AND** AI 用 XX 占位符标注推断量化数据，用户可点击填入真实数字

#### Scenario: 优化方向可选

- **WHEN** 用户打开 OptimizePanel
- **THEN** SHALL 显示 4 个操作按钮（全面优化/STAR重组/量化增强/关键词注入）
- **AND** 用户选择不同操作时，AI 改写策略随之变化

#### Scenario: 一键保存版本

- **WHEN** 用户选用方案
- **THEN** section 内容 SHALL 替换为选定方案
- **AND** 系统 SHALL 自动保存当前版本
- **AND** 已接受的方案内容中的占位符 SHALL 保留高亮样式直到用户编辑确认

### Requirement: OptimizePanel JD 上下文展示

OptimizePanel 打开时 SHALL 在面板中展示 JD 和 Reference 的上下文信息及其影响范围。

#### Scenario: 面板 JD 和 Reference 摘要

- **WHEN** 用户打开某 section 的 OptimizePanel
- **THEN** 面板 SHALL 显示 JD 信息行：「JD：{职位} @ {公司} — 影响：优先强化 {关键词}」
- **AND** 如有参考简历，SHALL 同步显示 Reference 信息行：「参考：{N} 份 — 影响：句式节奏、动词选择、量化密度」
- **AND** 如果没有选中 JD 或参考，对应行 SHALL 隐藏

#### Scenario: 无 JD 时隐藏 JD 行

- **WHEN** 用户未选择 JD
- **THEN** JD 信息行 SHALL 隐藏
- **AND** Operation 按钮中「关键词注入」的提示 SHALL 改为「基于职业画像优化」

### Requirement: 参考简历辅助优化选择

OptimizePanel SHALL 展示可勾选的参考简历列表，并标明其影响范围仅为风格笔法。

#### Scenario: 参考简历勾选区域

- **WHEN** OptimizePanel 打开且用户已导入参考简历
- **THEN** SHALL 显示「参考笔法」区域
- **AND** 列出所有参考简历名称（带 checkbox）
- **AND** 默认勾选 FTS5 自动匹配的前 3 份
- **AND** 区域下方 SHALL 标注：「影响：句式节奏、动词选择、量化密度 | 不影响内容方向」

#### Scenario: 参考简历影响优化结果

- **WHEN** 用户勾选了参考简历并进行优化
- **THEN** 选中的参考简历对应 section 内容 SHALL 作为风格范本传入优化 API
- **AND** AI 在 prompt 中收到：「参考以下优秀简历的表达风格，学习其量化方式和结构组织，但不要照抄内容」
- **AND** 参考风格 SHALL NOT 覆盖用户选择的 Operation
