## ADDED Requirements

### Requirement: 设置页展示求职画像卡片

设置页 SHALL 在"职业定位"区块上方展示"求职画像"卡片，显示从 explore 归纳的数据：

- 匹配类型（archetype）
- 推荐方向（targetRoles，含置信度标签）
- 技能清单（从 superpowers 展示）
- 工作偏好（preferences，若有）
- 硬约束（constraints，若有）
- 求职叙事（narrative）

该卡片仅在 `archetype` 或 `narrative` 字段存在时渲染。

#### Scenario: 有归纳数据时展示卡片

- **WHEN** 用户已通过 explore 保存归纳画像
- **THEN** 设置页顶部展示"求职画像"卡片，包含所有归纳字段

#### Scenario: 无归纳数据时隐藏

- **WHEN** localStorage 中无 archetype 且无 narrative
- **THEN** 设置页不展示"求职画像"卡片

### Requirement: 保存后提示可跳转

explore 页"保存到档案"成功后 SHALL 显示提示文案 `✓ 已保存到档案 · 查看 →`，点击跳转至 `/settings`。

#### Scenario: 保存成功展示提示

- **WHEN** 用户点击"保存到档案"且写入 localStorage 成功
- **THEN** 按钮文案变为"已保存到档案"，旁边出现"查看 →"链接

#### Scenario: 重复保存

- **WHEN** 用户再次归纳后再次保存
- **THEN** 按钮短暂变为"已保存到档案"再恢复，允许再次保存更新数据
