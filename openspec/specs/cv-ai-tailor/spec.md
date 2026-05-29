# Spec: CV AI Tailor

## Purpose
TBD

## ADDED Requirements

### Requirement: JD 定向简历优化

系统 SHALL 支持用户选择目标 JD 后，AI 定向优化简历关键词和表达，保持内容真实。

#### Scenario: 选择 JD 触发优化

- **WHEN** 用户在简历页面选择一个已保存的 JD 并点击"定向优化"
- **THEN** AI 分析 JD 关键要求 → 重写简历各段落 → 以 diff 对比视图展示修改
- **AND** AI 不编造经历，仅在表述层面优化关键词密度和侧重点

#### Scenario: 优化范围可选

- **WHEN** 用户触发定向优化
- **THEN** 用户可选择优化范围：全文 / 仅工作经历 / 仅项目经历 / 仅技能列表

#### Scenario: 一键复制或保存

- **WHEN** 优化完成后
- **THEN** 显示"复制"、"保存为新版本"、"替换当前版本"三个操作按钮

### Requirement: 量化经历提取

系统 SHALL 从用户的非结构化经历描述中提取或建议可量化的成果表述。

#### Scenario: 输入经历生成量化版本

- **WHEN** 用户输入"我负责了用户增长"
- **THEN** AI 返回建议："可补充为'主导用户增长策略，DAU 从 X 提升到 Y (+Z%)'——如有具体数据请替换 X/Y/Z"
- **AND** 用户可编辑确认后保存

#### Scenario: 批量扫描简历

- **WHEN** 用户点击"扫描量化机会"
- **THEN** AI 扫描简历全文，标注所有可以补充数据的描述点
- **AND** 每个标注点附带具体的量化建议

### Requirement: ATS 兼容检查

系统 SHALL 评估简历通过 Applicant Tracking System 筛选的概率。

#### Scenario: 运行 ATS 检查

- **WHEN** 用户点击"ATS 检查"
- **THEN** 返回评分报告：关键词密度、格式兼容性、段落结构评分
- **AND** 每个问题附带改进建议

#### Scenario: ATS 检查结果分级

- **WHEN** ATS 评分 > 80
- **THEN** 显示绿色"通过率高"
- **WHEN** ATS 评分 50-80
- **THEN** 显示黄色"有改进空间"
- **WHEN** ATS 评分 < 50
- **THEN** 显示红色"建议优化后再投递"

### Requirement: 简历综合评分

系统 SHALL 对每份简历给出综合评分和改进建议。

#### Scenario: 简历评分

- **WHEN** 用户查看简历
- **THEN** 显示综合评分（0-100）和四个子维度：内容完整度、结构清晰度、关键词覆盖、量化程度
- **AND** 每项附带 1-2 条具体改进建议
