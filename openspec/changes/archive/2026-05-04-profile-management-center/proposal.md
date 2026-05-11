## Why

/profile 页面目前是只读展示——用户能看到 Agent 对话中生成的画像数据，但无法手动修正。如果 AI 提取的技能不准确、偏好推断错了、目标岗位变了，用户只能回到 Agent Chat 重新对话来修正。这不是管理，这是被动观看。

用户需要能直接在 /profile 页面上管理自己的求职画像：编辑目标、调整技能、设置偏好、查看和回退历史变更。

## What Changes

- 所有画像卡片（目标岗位、核心技能、偏好设置）改为**点击弹出表单编辑**模式
- 新增**锁定机制**：用户手动修改过的字段标记为 `source: "manual"`，Agent 后续自动更新不再覆盖该字段
- 目标岗位卡片支持：添加/删除目标角色、编辑薪资期望、增删底线条件
- 核心技能卡片支持：调整熟练度滑块、手动添加技能、删除技能
- 进化轨迹每条记录支持：点击查看变更详情、一键还原到历史版本
- 底部新增数据操作区：从 SQLite 同步最新数据、导出画像 JSON、重置画像（需确认）
- 技能雷达和偏好分布保持门槛展示逻辑（≥3/≥5 评估才出现）
- /profile 和 /settings 保持独立

## Capabilities

### New Capabilities
- `profile-editable-goals`: 目标岗位卡片可点击弹出表单编辑——增删目标角色、薪资范围、底线条件。写入 SQLite goals_json 并标记 confirmedAt
- `profile-editable-skills`: 核心技能卡片可点击弹出表单调整——熟练度滑块、手动添加技能、删除技能。写入 SQLite data_json 并标记 source
- `profile-lock-mechanism`: 画像字段锁定机制——用户手动修改过的字段标记 `source: "manual"`。Agent 自动更新和 profile-mining 推断不覆盖已锁定字段
- `profile-history-actions`: 进化轨迹每条记录可点击查看变更详情（弹窗显示该次更新的完整 changes 列表），支持一键还原到历史版本（回退 goals + skills + preferences）

### Modified Capabilities
- `profile-settings-ui`: /profile 页面从只读展示变为管理中心——每个卡片区域添加编辑入口（编辑图标/点击触发），数据操作区（同步/导出/重置），锁定状态指示器

## Impact

- **前端**: `/app/profile/page.tsx` 重写为管理型布局；新增 `EditGoalsDialog`、`EditSkillsDialog`、`EditPreferencesDialog`、`HistoryDetailDialog` 组件
- **API**: `/api/data/profile` PUT 已支持 goals/data 独立更新，无需改动；`/api/data/profile` PATCH 增加 `lockedFields` 参数
- **类型**: `ZhiyuanProfile` 扩展 `lockedFields` 字段
- **无破坏性**: 现有数据展示组件（SkillRadar、PreferenceBars、EvolutionTimeline）保持不变
