## ADDED Requirements

### Requirement: 面试出题工具

系统 SHALL 提供 `generate_interview_questions` 工具，通过 Agent tool loop 调用，基于 JD、CV 和面试模式动态生成题目。

#### Scenario: 基于 JD 出题

- **WHEN** Agent 调用 `generate_interview_questions`，参数包含 `jdText`
- **THEN** 生成 8-12 道题目，均匀分布在四个类别：行为面试、技术/专业、案例分析、文化匹配
- **AND** 每道题包含：`category`、`question`、`context`（出题依据）、`storyHint`（准备提示）
- **AND** 题目注明 `source: "jd"`

#### Scenario: 通用出题（无 JD）

- **WHEN** Agent 调用 `generate_interview_questions`，但 `jdText` 为空或缺失
- **THEN** 基于 `cvText` 和 `company`/`role` 生成通用题目
- **AND** 题目注明 `source: "general"`
- **AND** Agent 在对话中提示"提供目标 JD 可以生成更精准的题目"

#### Scenario: 按模式调整出题策略

- **WHEN** Agent 调用 `generate_interview_questions`，参数 `mode` 指定了面试模式
- **THEN** 出题风格随模式变化：
  - `project-review`: 侧重项目经验、数据驱动、决策过程
  - `behavioral`: 侧重 STAR 格式、软技能、冲突处理
  - `situational`: 侧重情景模拟、问题拆解、方案设计
  - `structured`: 侧重"为什么来/做过什么/怎么做的/结果/能带来什么"
  - `founder`: 侧重多面手能力、创业心态、风险认知
  - `state-owned`: 侧重学历背景、政治觉悟、长期规划、服从意识
- **AND** 如果 `mode` 不指定，默认为 `behavioral`

#### Scenario: 针对弱项出题

- **WHEN** Agent 能从 Memory/Career DNA 获取到用户的弱项信号
- **THEN** 出题时增加弱项方向的题目比例
- **AND** 弱项题目标注"建议重点准备"

### Requirement: 回答评分工具

系统 SHALL 提供 `score_interview_answer` 工具，对用户的面试回答进行四维度 AI 评分。

#### Scenario: 四维度评分

- **WHEN** Agent 调用 `score_interview_answer`，参数包含 `question`（原题）和 `answer`（用户回答）
- **THEN** 返回四个维度评分（1-5 分）：结构完整度、具体程度、亮点突出、时间控制
- **AND** 返回综合评分（加权平均，权重随 `mode` 变化）
- **AND** 返回 2-3 条改进建议

#### Scenario: 模式权重自适应

- **WHEN** `mode` 为 `state-owned`（国企模式）
- **THEN** 评分权重弱化"亮点突出"（权重降至 10%），强化"结构完整度"（权重升至 40%）
- **AND** 改进建议偏向"稳重表达"、"谦虚措辞"、"政治觉悟"方向

- **WHEN** `mode` 为 `founder`（创始人模式）
- **THEN** 评分权重强化"亮点突出"（权重升至 35%）
- **AND** 改进建议偏向"展示多面手能力"、"快速价值主张"

#### Scenario: 长回答逐段反馈

- **WHEN** 用户回答 > 300 字
- **THEN** 返回 `segmentFeedback` 数组，每段标注 `rating`（good/expand/missing）和评语
- **AND** 评分结果中包含每段的具体改进方向

#### Scenario: 无模式时的默认评分

- **WHEN** `mode` 参数为空或未指定
- **THEN** 使用默认权重：结构完整度 30%、具体程度 30%、亮点突出 25%、时间控制 15%
