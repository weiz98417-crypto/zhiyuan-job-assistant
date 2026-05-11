# Spec: Report Browsing UI

## ADDED Requirements

### Requirement: 报告卡片列表

系统 SHALL 在 `/evaluate/reports` 路由下以卡片列表展示所有评估报告，每张卡片显示：公司名、职位名、总体评分（ScoreBadge）、评估日期、archetype 标签、关键词摘要。

#### Scenario: 空报告列表

- **WHEN** 用户进入报告列表页且无任何报告
- **THEN** 显示温暖空白提示："还没有评估报告，去评估一个职位吧"
- **AND** 提供跳转到评估页面的按钮

#### Scenario: 有报告时的卡片列表

- **WHEN** 报告列表中有数据
- **THEN** 以卡片网格布局展示（2列 desktop / 1列 mobile）
- **AND** 默认按评估日期降序排列（最新在前）
- **AND** 每张卡片显示评分彩色标识（绿色高分 / 黄色中等 / 灰色低分）

#### Scenario: 点击卡片查看详情

- **WHEN** 用户点击某张报告卡片
- **THEN** 从右侧滑出详情面板（desktop）或全屏展示（mobile）
- **AND** 复用 A-G 模块渲染方式显示完整报告内容

### Requirement: 报告搜索

系统 SHALL 提供搜索框，支持按公司名、职位名、关键词搜索报告。

#### Scenario: 按公司名搜索

- **WHEN** 用户输入公司名关键词
- **THEN** 实时过滤显示匹配的报告卡片
- **AND** 搜索大小写不敏感

#### Scenario: 按关键词搜索

- **WHEN** 用户输入技能或行业关键词（如"React"、"AI"）
- **THEN** 过滤显示 `keywords` 数组中包含该关键词的报告

#### Scenario: 无匹配结果

- **WHEN** 搜索无匹配
- **THEN** 显示"没有找到匹配的报告"

### Requirement: 报告筛选和排序

系统 SHALL 支持按评分范围、时间范围筛选报告，以及按评分或日期排序。

#### Scenario: 按评分范围筛选

- **WHEN** 用户选择筛选"4分以上"
- **THEN** 仅显示 `overallScore >= 4` 的报告

#### Scenario: 按时间范围筛选

- **WHEN** 用户选择筛选"最近30天"
- **THEN** 仅显示 `date` 在最近30天内的报告

#### Scenario: 排序切换

- **WHEN** 用户切换排序方式为"按评分"
- **THEN** 报告卡片按 `overallScore` 降序排列

#### Scenario: 清除筛选

- **WHEN** 用户点击"清除筛选"
- **THEN** 恢复显示全部报告，按默认排序

### Requirement: 报告删除

系统 SHALL 支持删除报告，删除时需确认并解除关联 JD 的引用。

#### Scenario: 删除确认

- **WHEN** 用户在详情面板点击删除
- **THEN** 弹出确认对话框："确定删除该评估报告？"
- **AND** 确认后删除报告
- **AND** 若有关联 JD，解除该 JD 的 `reportId` 关联
- **AND** 拒绝后不做任何操作
