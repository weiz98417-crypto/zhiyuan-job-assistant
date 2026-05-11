## Why

求职画像引擎提供了"系统理解用户"的能力，但用户还没有从中受益。Agent 智能推荐是画像的第一个消费者：让用户设定目标，然后 Agent 基于画像每天推荐最匹配的岗位，用户只需审批。从"用户自己找"升级为"Agent 帮你找，你来拍板"。

## What Changes

- 新增目标设定向导——交互式多步骤流程，收集求职目标（角色/级别/薪资/底线/偏好）
- 目标数据持久化到求职画像中，成为 Agent 的决策参数
- 新增 `POST /api/agent/recommend`——基于画像 + 目标，扫描 Pipeline 中待评估 JD，返回 Top 3 推荐及个性化理由
- 推荐理由引用画像中的技能匹配、偏好契合、风险提示
- 新增目标管理 UI（查看/编辑当前目标）
- 每日摘要卡片升级：展示 Agent 推荐结果

## Capabilities

### New Capabilities

- `agent-recommend`: Agent 智能推荐引擎——基于求职画像和目标，从 Pipeline 中推荐最匹配的岗位
- `goal-setting`: 求职目标设定向导——交互式多步骤流程，收集并持久化用户求职目标

### Modified Capabilities

- `frontend-shell`: 首页"今日手帳"摘要卡片升级为 Agent 推荐视图
- `career-profile`: 画像模型新增 goals 字段（目标角色、薪资范围、底线条件、偏好权重）

## Impact

- 新增 API: `POST /api/agent/recommend`
- 新增组件: GoalSettingWizard（目标设定向导）、RecommendCard（推荐卡片）
- 修改: 首页今日手帳卡片、求职画像数据模型
- 依赖: career-profile-engine（必须先完成画像引擎）
