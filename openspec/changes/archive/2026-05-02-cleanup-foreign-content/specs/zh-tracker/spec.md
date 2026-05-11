## ADDED Requirements

### Requirement: 中文投递追踪
系统 SHALL 在 `modes/zh/tracker.md` 提供投递追踪模式，使用中文状态和术语。

#### Scenario: 查看中文投递状态
- **WHEN** 用户查询投递状态
- **THEN** 系统显示中文状态标签：待评估/已投递/已回复/面试中/已Offer/已拒绝/已放弃/跳过

### Requirement: 中国投递数据统计
模式 SHALL 提供以下中国求职者关注的统计维度：
- 各平台投递转化率（BOSS直聘 vs 拉勾 vs 猎聘）
- 薪资分布（税前月薪，含五险一金分析）
- 响应时间统计
- 面试转化漏斗

#### Scenario: 投递数据分析
- **WHEN** 用户查看投递统计
- **THEN** 系统展示以上维度的数据图表和优化建议
