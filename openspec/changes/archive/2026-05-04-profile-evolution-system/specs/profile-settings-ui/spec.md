## ADDED Requirements

### Requirement: 渐进式内容展示

/profile 页面 SHALL 根据画像数据丰富度分层展示内容，而非仅在全数据齐备时才展示。初次定位完成后 SHALL 立即展示基础画像。

#### Scenario: 初次定位后展示基础画像

- **WHEN** 用户完成初次定位且 profile.goals 非空，但尚无评估报告和面试记录
- **THEN** 页面 SHALL 展示：目标岗位卡片（targetRoles + 匹配依据）、核心优势列表（来自 CV + 定位对话）、下一步行动建议、进化轨迹（至少含"初次定位完成"条目）
- **AND** SHALL 不展示空白提示

#### Scenario: 技能雷达门槛

- **WHEN** 用户完成 3 次以上 JD 评估
- **THEN** 页面 SHALL 展示 SkillRadar 组件
- **AND** 数据不足时展示"完成更多评估来解锁技能分析"提示

#### Scenario: 偏好分布门槛

- **WHEN** 用户完成 5 次以上 JD 评估
- **THEN** 页面 SHALL 展示 PreferenceBars 组件
- **AND** 数据不足时展示"完成更多评估来了解你的偏好分布"提示

#### Scenario: 技能缺口门槛

- **WHEN** 用户有面试练习记录或 5 次以上 JD 评估
- **THEN** 页面 SHALL 展示 SkillGapList 组件
- **AND** 数据不足时展示"完成面试练习或更多评估来发现技能缺口"提示

### Requirement: 画像空白状态重设计

当画像完全为空（无 goals 且无任何数据）时，/profile 页面 SHALL 展示引导式空白状态，而非仅提示"画像尚未生成"。

#### Scenario: 完全空白时展示引导

- **WHEN** profile.goals 为空且无任何评估数据
- **THEN** 页面 SHALL 展示引导卡片："开始你的求职之旅"
- **AND** 包含「自我定位」快捷入口按钮（跳转至 Agent Chat）
- **AND** 包含简要说明："AI 会通过几轮对话帮你梳理求职方向，完成后这里将展示你的专属求职画像"
