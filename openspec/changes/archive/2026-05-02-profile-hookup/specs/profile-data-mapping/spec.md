## ADDED Requirements

### Requirement: ProfileData → UserProfile 映射

系统 SHALL 将 explore 归纳结果（ProfileData）正确映射为 UserProfile 格式，合并写入 localStorage 的 `lingji-ai-profile` 键，不覆盖已有的手动填写字段。

- targetRoles 映射：`{ title, confidence, reasoning }` → `{ name: title, level: "", fit: confidence>=80?"primary":"secondary" }`
- skills.advantage → superpowers 数组，去重追加
- narrative → headline（若 headline 为空则填充）
- archetype、preferences、constraints 作为新可选字段写入 UserProfile

#### Scenario: 首次保存归纳结果

- **WHEN** 用户首次点击"保存到档案"且 settings 中无已有数据
- **THEN** `lingji-ai-profile` 包含合并后的 UserProfile，targetRoles 已转换，superpowers 已填充，narrative 已写入

#### Scenario: 合并到已有档案

- **WHEN** 用户已有手动填写的 profile，再点击"保存到档案"
- **THEN** 新的归纳数据追加到已有 superpowers（去重），targetRoles 以归档数据为准（可被手动覆盖），已有 fullName/email 等字段保持不变

### Requirement: UserProfile 类型扩展

UserProfile 类型 SHALL 新增可选字段以承载归纳画像数据：

- `narrative?: string` — 求职叙事文案
- `archetype?: string` — 匹配的求职者原型
- `preferences?: { companyType?, industry?, culture?, workStyle? }` — 工作偏好
- `constraints?: { salary?, location?, hours?, other?: string[] }` — 硬约束

#### Scenario: 旧版 UserProfile 数据向后兼容

- **WHEN** localStorage 中已有旧版 UserProfile（不含 narrative/archetype/preferences/constraints）
- **THEN** 系统正常读取，缺少字段为 undefined，不影响现有功能
