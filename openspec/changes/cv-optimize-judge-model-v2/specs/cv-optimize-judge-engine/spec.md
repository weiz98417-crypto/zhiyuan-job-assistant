# Spec: CV Optimize Judge Engine

## ADDED Requirements

### Requirement: 四维评判模型优先级

系统 SHALL 按照 Operation > JD ≈ Reference > Effort 的优先级构建优化 prompt，确保高层优先级指令不被低层覆盖。

#### Scenario: Operation 为最高优先级

- **WHEN** 用户选择了「量化增强」操作
- **THEN** prompt SHALL 以量化增强为核心任务
- **AND** 后续的 JD 滤网和 Reference 风格指令 SHALL 限定在量化增强的框架内
- **AND** AI MUST NOT 执行 STAR 重组或段落结构变更（即使用户未选择）

#### Scenario: JD 与 Reference 冲突时内容优先

- **WHEN** Reference 的风格基调与 JD 要求的行业属性存在矛盾（如 Reference 偏管理导向、JD 要求技术深度）
- **THEN** prompt SHALL 指示 AI 内容方向走 JD、表达技法走 Reference 的可迁移部分
- **AND** 如无法调和，JD 权重 SHALL > Reference，Reference 影响力降至 30%

#### Scenario: Effort 控制执行深度

- **WHEN** 用户选择 Effort 1
- **THEN** prompt SHALL 指示 AI 仅润色措辞，不做结构变更和量化推断
- **WHEN** 用户选择 Effort 5
- **THEN** prompt SHALL 指示 AI 大胆推断量化维度，每段至少 4 个 XX 占位符，可使用完全不同的信息组织方式

### Requirement: Operation 操作类型映射

系统 SHALL 根据用户选择的 Operation 生成不同的核心改写指令。

#### Scenario: 全面优化

- **WHEN** Operation = "full"
- **THEN** prompt SHALL 包括措辞润色、轻度 STAR 优化、适度量化标注、自然关键词融入
- **AND** 三者权重均衡（各约 33%）

#### Scenario: STAR 重组

- **WHEN** Operation = "star"
- **THEN** prompt SHALL 以 STAR 框架重组段落为核心任务
- **AND** MUST NOT 新增量化推断（除非 Effort ≥ 4 且占位符开关开启）
- **AND** 重组后每段应有明确的 Situation/Task/Action/Result 标识

#### Scenario: 量化增强

- **WHEN** Operation = "quantify"
- **THEN** prompt SHALL 以补充量化维度为核心任务
- **AND** MUST NOT 改变段落原有结构
- **AND** 如占位符开关开启，用 `[XX]` 格式标注推断值

#### Scenario: 关键词注入

- **WHEN** Operation = "keywords"
- **THEN** prompt SHALL 以植入关键词为核心任务
- **AND** 关键词植入 SHALL 自然流畅，不做 keyword stuffing
- **AND** 如无 JD，SHALL 基于用户画像中的目标方向选择行业关键词

### Requirement: Effort 5 档强度控制

系统 SHALL 根据 Effort 值生成不同的改写深度指令。

#### Scenario: Effort 1 温和

- **WHEN** Effort = 1
- **THEN** prompt SHALL 指示：只润色措辞、修正语法、不添加新内容、不改变结构
- **AND** Temperature SHALL = 0.3

#### Scenario: Effort 2 保守

- **WHEN** Effort = 2
- **THEN** prompt SHALL 指示：优化动词选择、微调句式、标注可量化机会但不直接写入
- **AND** Temperature SHALL = 0.3

#### Scenario: Effort 3 适中

- **WHEN** Effort = 3
- **THEN** prompt SHALL 指示：适度补量化占位（每段 1-2 个）、可微调段落结构、轻度关键词融入
- **AND** Temperature SHALL = 0.7

#### Scenario: Effort 4 大刀

- **WHEN** Effort = 4
- **THEN** prompt SHALL 指示：每段 3-4 个 XX 占位、可为部分段落做 STAR 重组、强化关键词密度
- **AND** Temperature SHALL = 0.9

#### Scenario: Effort 5 重写

- **WHEN** Effort = 5
- **THEN** prompt SHALL 指示：完全重写段落、每段 4+ 个 XX 占位、全部 STAR 格式化、最大化关键词覆盖
- **AND** Temperature SHALL = 0.9

### Requirement: JD 内容滤网

系统 SHALL 将 JD 信息作为内容滤网传入 prompt，影响 AI 的重点选择但不改变 Operation。

#### Scenario: JD 滤网影响内容优先级

- **WHEN** 提供 targetJD 且 JD 有关键词
- **THEN** prompt SHALL 指示 AI 优先为与 JD 关键词相关的经历执行优化
- **AND** 非相关的经历 SHALL 降低优化详细程度但不跳过
- **AND** JD 滤网 SHALL NOT 改变 Operation 的操作类型

#### Scenario: 无 JD 时均匀优化

- **WHEN** 未提供 targetJD
- **THEN** prompt SHALL 指示 AI 对所有内容均匀优化
- **AND** 不生成「定向」方案

### Requirement: Reference 风格范本

系统 SHALL 提取参考简历的风格特征并融入 prompt，指导表达方式而非内容方向。

#### Scenario: 参考风格特征提取

- **WHEN** 提供 referenceIds
- **THEN** 系统 SHALL 读取对应参考简历中的匹配 section
- **AND** prompt SHALL 包含参考范例内容，并指示 AI 「参考表达风格和量化方式，但不要照抄内容」
- **AND** style notes SHALL 包括：句长节奏、动词强度、量化密度、专业语气

#### Scenario: 无参考简历时自由发挥

- **WHEN** 未提供 referenceIds
- **THEN** prompt SHALL 指示 AI 根据用户画像中的 headline 和 superpowers 自行判断专业语气

### Requirement: XX 占位符推断

系统 SHALL 支持 AI 用 XX 占位符标注推断量化维度，替代「禁止编造」的一刀切约束。

#### Scenario: 占位符开启时的推断

- **WHEN** enablePlaceholders = true
- **THEN** prompt SHALL 指示 AI：「你可以推断合理的量化维度，用 [XX] 或 [XX: 简要说明] 格式标注，不要编造具体数字」
- **AND** 占位符示例 SHALL 包含在 prompt 中：「如：日均处理 [XX]+ 次请求、管理 [XX] 张表」

#### Scenario: 占位符关闭时的保守行为

- **WHEN** enablePlaceholders = false
- **THEN** prompt SHALL 指示 AI：「不要添加原文中没有的量化数据」
- **AND** AI SHALL 仅优化已有数字的表述方式

### Requirement: 追问模式

系统 SHALL 支持在生成方案前，AI 先返回信息补充问题供用户回答。

#### Scenario: 追问模式触发

- **WHEN** enableQuestions = true AND Effort ≥ 4
- **THEN** 系统 SHALL 先调用 AI 分析原文，生成 2-4 个选择题/填空题
- **AND** 追问 SHALL 以独立接口返回（`/api/cv/optimize-section/ask`）
- **AND** 每个追问 SHALL 包含：问题文本、选项列表（如有）、是否必填

#### Scenario: 用户回答追问后生成方案

- **WHEN** 用户提交追问答案（questionAnswers 数组）
- **THEN** 系统 SHALL 将答案融入 prompt 中作为原文补充信息
- **AND** 答案内容 SHALL 替代对应的 XX 占位符推断
- **AND** 未回答的问题对应部分 SHALL 仍使用 XX 占位符

#### Scenario: 用户跳过追问

- **WHEN** 用户点击「跳过追问，直接生成」
- **THEN** 系统 SHALL 退回到 XX 占位符模式生成方案
- **AND** 不保留追问中间状态

### Requirement: 方案生成策略

系统 SHALL 根据是否有 JD 生成不同数量的方案。

#### Scenario: 有 JD 时生成 2 个方案

- **WHEN** targetJD 存在
- **THEN** 系统 SHALL 生成方案 A（定向：Operation × JD × Reference × Effort）和方案 B（通用：Operation × Reference × Effort）
- **AND** 两个方案 SHALL 有明显的关键词侧重差异

#### Scenario: 无 JD 时生成 1 个方案

- **WHEN** targetJD 不存在
- **THEN** 系统 SHALL 生成 1 个通用方案（Operation × Reference × Effort）
- **AND** 该方案 SHALL 标记为通用优化

### Requirement: 偏好历史学习

系统 SHALL 将用户历史偏好纳入 prompt，自动调整优化倾向。

#### Scenario: 偏好融合

- **WHEN** 用户有历史偏好记录且触发优化
- **THEN** prompt SHALL 附带最近 10 条偏好：包含 accept/reject、operation 类型、variant 类型
- **AND** 偏好权重 SHALL 随时间衰减：最近 3 天权重 1.0，3-7 天 0.7，7 天以上 0.4

### Requirement: 模型与参数配置

系统 SHALL 使用 deepseek-v4-pro 模型，并根据 Effort 动态调整参数。

#### Scenario: 模型选择

- **WHEN** 调用优化 API
- **THEN** 系统 SHALL 使用模型 `deepseek-v4-pro`
- **AND** Max Tokens SHALL = 8000

#### Scenario: Temperature 动态调整

- **WHEN** Effort ≤ 2
- **THEN** Temperature SHALL = 0.3
- **WHEN** Effort = 3
- **THEN** Temperature SHALL = 0.7
- **WHEN** Effort ≥ 4
- **THEN** Temperature SHALL = 0.9
