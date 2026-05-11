## ADDED Requirements

### Requirement: Agent SHALL detect skill gaps between CV and JD

`detect_skill_gaps` 工具 SHALL 对比用户 CV 中的技能与目标 JD 的技能要求，输出缺失技能列表及优先级。

#### Scenario: 存在技能缺口

- **WHEN** JD 要求 "Python, SQL, A/B测试, 用户增长"，CV 包含 "Python, SQL"
- **THEN** 输出缺口列表 `["A/B测试(高优先级)", "用户增长(中优先级)"]`
- **AND** 每个缺口附学习建议

#### Scenario: CV 不完整

- **WHEN** CV 内容为空或主要 section 缺失
- **THEN** 返回 "CV 信息不完整，建议先完善简历（特别是技能和工作经历栏位）"
