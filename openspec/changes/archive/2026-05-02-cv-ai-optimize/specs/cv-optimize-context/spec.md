## ADDED Requirements

### Requirement: UserProfile 上下文集成

系统 SHALL 在优化时读取 UserProfile 并注入 prompt，确保所有 section 优化后语气一致。

#### Scenario: 读取 UserProfile

- **WHEN** 用户点击生成方案
- **THEN** 前端从 localStorage 读取 `lingji-ai-profile`
- **AND** 提取 headline、superpowers、targetRoles 作为 userProfile 传入 API

#### Scenario: 无 UserProfile 时降级

- **WHEN** localStorage 中不存在 `lingji-ai-profile`
- **THEN** 仍然正常生成优化方案
- **AND** prompt 中使用通用职业化语气

### Requirement: JD 配对触发方案 C

系统 SHALL 检测当前是否已选 JD 配对，决定是否生成定向方案 C。

#### Scenario: 已选 JD 时生成方案 C

- **WHEN** CV 页面右侧已选择 JD 配对（selectedReport 存在）
- **THEN** 优化面板显示提示「已检测到 JD 配对，将生成定向方案」
- **AND** 请求中传入 targetJD（role, company, keywords）
- **AND** API 返回方案 A + B + C

#### Scenario: 未选 JD 时不生成方案 C

- **WHEN** 用户未选择 JD 配对
- **THEN** 仅生成方案 A + B
- **AND** 不传 targetJD 字段

### Requirement: 全局一致性

系统 SHALL 将当前版本的所有 section 内容作为上下文传给 AI。

#### Scenario: 注入全量 CV

- **WHEN** 用户优化任意 section
- **THEN** 前端将当前版本 5 个 section 的内容拼接为 fullCV 传入 API
- **AND** AI 基于全量 CV 上下文理解用户的经历、技能、风格
- **AND** 优化后的 section 语气与其他 section 保持一致

#### Scenario: 仅一个 section 有内容时

- **WHEN** 全量 CV 仅当前 section 有内容
- **THEN** fullCV 仅包含该 section
- **AND** 正常生成优化方案
