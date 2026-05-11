## ADDED Requirements

### Requirement: 练习统计看板

系统 SHALL 在面试准备仪表盘中展示练习数据的统计分析。

#### Scenario: 练习次数和平均分

- **WHEN** 用户有练习记录
- **THEN** 显示总练习次数和加权平均分（如有评分）
- **AND** 平均分显示等级标签（0-1 需大幅提升 / 1-2 需加强 / 2-3 一般 / 3-4 良好 / 4-5 优秀）

#### Scenario: 近期趋势

- **WHEN** 用户有 ≥3 次练习记录
- **THEN** 显示最近 10 次练习的分数趋势（简单折线或柱状图）
- **AND** 趋势图标注首次和最近一次练习的分数变化

#### Scenario: 题型分布

- **WHEN** 用户有练习记录
- **THEN** 显示按题目类别（行为面试/技术专业/案例分析/文化匹配）分组的练习次数和均分
- **AND** 均分最低的类别高亮标注

#### Scenario: 模式分布

- **WHEN** 用户有使用多种教练模式的练习记录
- **THEN** 显示按模式（项目复盘/行为问答/等）分组的练习次数
- **AND** 显示每种模式下的均分

### Requirement: 数据来源

练习统计数据 SHALL 从 IndexedDB（DexieDB）的 `practiceRecords` 表中直接聚合计算。

#### Scenario: 纯客户端计算

- **WHEN** 用户访问 `/interview` 页面
- **THEN** 统计数据从 `db.practiceRecords.toArray()` 聚合计算
- **AND** 不涉及后端 API 调用
- **AND** 数据在组件挂载时一次性加载

#### Scenario: 空数据状态

- **WHEN** `practiceRecords` 表为空
- **THEN** 不显示统计区域
- **AND** 显示引导卡片"去 [模拟面试] 开始第一次练习"
