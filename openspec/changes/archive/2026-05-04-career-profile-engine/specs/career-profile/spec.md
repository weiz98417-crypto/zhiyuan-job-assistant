## ADDED Requirements

### Requirement: 求职画像数据模型

系统 SHALL 维护一个结构化的求职画像（CareerProfile），包含技能、偏好、市场对标和进化历史，存储于 DexieDB 新表中。

#### Scenario: 画像初始化

- **WHEN** 用户首次使用画像功能
- **THEN** 系统创建空白画像结构
- **AND** 所有技能、偏好、市场对标字段为空或默认值
- **AND** history 记录一条 "画像已创建" 事件

#### Scenario: 画像数据存储

- **WHEN** 画像生成或更新完成
- **THEN** 完整 CareerProfile JSON 写入 DexieDB profiles 表
- **AND** 保留最近 10 个版本的完整快照

### Requirement: 数据挖掘管线

系统 SHALL 从 DexieDB 现有数据表和 localStorage 中提取特征，混合使用统计计算和 LLM 推理生成画像。

#### Scenario: 结构化数据统计提取

- **WHEN** 系统执行画像分析
- **THEN** 从 applications 表统计：投递总数、通过率、各状态分布、评分分布
- **AND** 从 reports 表统计：各维度平均分、行业分布、公司规模分布
- **AND** 从 practiceRecords 表统计：练习总次数、各类型题目次数
- **AND** 统计数据直接写入画像，不经过 LLM

#### Scenario: 非结构化数据 LLM 推理

- **WHEN** 系统执行画像分析且存在非结构化数据（STAR stories、practice answers、CV 文本）
- **THEN** 所有文本聚合为单次 LLM 调用，提取技能列表、熟练度评估、偏好信号
- **AND** LLM 返回结构化 JSON（技能数组 + 偏好对象 + 缺口数组）
- **AND** 如果 LLM 调用失败，使用统计数据生成基础画像作为回退

#### Scenario: 增量更新

- **WHEN** 用户进行了新的评估或练习且距离上次画像更新超过 24 小时
- **THEN** 系统自动触发增量画像更新
- **AND** history 追加新的变更事件，描述本次新数据带来的画像变化

#### Scenario: 强制全量重算

- **WHEN** 用户调用 API 时传入 `force: true`
- **THEN** 系统忽略缓存时间戳，全量重算所有数据源
- **AND** 生成完整的新版本画像快照

### Requirement: 隐私保护

系统 SHALL 在发送数据给 LLM 时对敏感信息进行脱敏处理。

#### Scenario: 数据脱敏

- **WHEN** 系统调用 LLM 进行画像推理
- **THEN** 发送的数据 SHALL NOT 包含公司全名（仅保留行业和规模）
- **AND** SHALL NOT 包含原始 JD 全文（仅保留要求和技能关键词）
- **AND** SHALL NOT 包含聊天全文（仅保留主题标签和偏好信号摘要）
