## MODIFIED Requirements

### Requirement: 面试问题生成

系统 SHALL 基于 JD + 简历 + 用户已有的 STAR 故事生成个性化面试题目。

#### Scenario: 生成题目时参考已有故事

- **WHEN** 用户在配置区点击"生成面试题目"
- **THEN** 系统 SHALL 读取用户已有的 STAR 故事（最多 5 个）
- **AND** 将故事摘要传入出题 API 作为上下文
- **AND** AI 生成题目时 SHALL 优先出用户有相关经历方向的题目，避免出用户完全无经验方向的题目

#### Scenario: 无故事时正常出题

- **WHEN** 用户没有任何 STAR 故事
- **THEN** 系统 SHALL 正常基于 JD + 简历生成题目，不受影响

### Requirement: 题库统一视图

题库区域 SHALL 展示练习记录和 STAR 故事的统一视图，并支持练习记录转为 STAR 故事。

#### Scenario: 查看练习记录详情

- **WHEN** 用户展开一条练习记录
- **THEN** 系统 SHALL 显示完整题目、回答、评分、标签、练习时间

#### Scenario: 练习记录转为 STAR 故事

- **WHEN** 用户在练习记录详情中点击"转为 STAR 故事"
- **THEN** 系统 SHALL 打开故事编辑器
- **AND** 预填标题（基于题目关键词）和内容（从 Q&A 对中提取的段落）
- **AND** 用户编辑后保存为新的 STAR 故事

#### Scenario: 搜索和筛选作用于两者

- **WHEN** 用户输入搜索关键词或选择分类筛选
- **THEN** 系统 SHALL 同时搜索练习记录和 STAR 故事
- **AND** 标注每条结果的来源（练习记录 / 手动故事）
