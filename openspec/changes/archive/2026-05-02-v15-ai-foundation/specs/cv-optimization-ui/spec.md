# Spec: CV Optimization UI

## ADDED Requirements

### Requirement: AI 定向优化面板

简历页面 SHALL 提供 AI 定向优化面板，用户选择目标 JD 后 AI 自动优化简历。

#### Scenario: 选择 JD 触发优化

- **WHEN** 用户选择已保存的 JD 并点击"定向优化"
- **THEN** AI 分析 JD 关键要求并重写简历各段落
- **AND** 以 diff 对比视图展示修改（原版 vs 优化版左右对照）
- **AND** AI 不编造经历，仅在表述层面优化

#### Scenario: 优化范围可选

- **WHEN** 用户触发定向优化
- **THEN** 可选择优化范围：全文 / 仅工作经历 / 仅项目经历 / 仅技能列表

#### Scenario: 一键保存版本

- **WHEN** 优化完成
- **THEN** 显示"复制"、"保存为新版本"、"替换当前版本"三个操作按钮

### Requirement: 量化经历提取

系统 SHALL 从非结构化经历描述中提取或建议量化成果表述。

#### Scenario: 输入经历生成量化版本

- **WHEN** 用户输入"我负责了用户增长"
- **THEN** AI 返回量化建议，标注 [推断] 部分供用户编辑确认

#### Scenario: 批量扫描简历

- **WHEN** 用户点击"扫描量化机会"
- **THEN** AI 扫描简历全文，标注所有可补充数据的描述点

### Requirement: ATS 兼容检查

系统 SHALL 评估简历通过 ATS（Applicant Tracking System）筛选的概率。

#### Scenario: ATS 评分与分级

- **WHEN** 用户点击"ATS 检查"
- **THEN** 返回关键词密度、格式兼容性、段落结构三项评分
- **AND** 总分 > 80 绿色 / 50-80 黄色 / < 50 红色
- **AND** 每项附带改进建议

### Requirement: 简历综合评分

系统 SHALL 对每份简历给出综合评分（0-100）。

#### Scenario: 评分展示

- **WHEN** 用户查看简历
- **THEN** 显示综合评分和四个子维度：内容完整度、结构清晰度、关键词覆盖、量化程度
- **AND** 每项附带具体改进建议
