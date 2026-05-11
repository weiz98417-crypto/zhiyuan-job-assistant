## ADDED Requirements

### Requirement: 差异化提示

系统 SHALL 生成 2-3 条差异化提示，标注 JD 最强调的能力要求与用户简历中对应薄弱环节的对比，帮助用户明确投递前需要针对性强化的内容。

每条提示格式：`{ jdEmphasis: "JD强调的能力", resumeWeakness: "简历中的薄弱表现", tip: "改进建议" }`

#### Scenario: 有明显差异化信号

- **WHEN** JD 反复强调"从 0 到 1 搭建"但简历偏维护优化
- **THEN** 系统提示 `{ jdEmphasis: "0到1搭建经验", resumeWeakness: "简历侧重维护和迭代，缺少新建项目描述", tip: "如果有相关经历，建议补充在项目描述中；如果没有，可在求职信中说明你对搭建流程的理解" }`

#### Scenario: 无明显差异

- **WHEN** JD 要求与简历表现方向一致
- **THEN** 系统返回空数组或简短肯定提示

### Requirement: 差异化提示 UI

前端 SHALL 在关键词覆盖率区块后以卡片列表形式展示差异化提示，每条为橙色提醒样式卡片。

#### Scenario: 有提示的展示

- **WHEN** 评估报告包含 differentiationTips 数据
- **THEN** 报告页面展示"投递前重点关注"卡片列表
