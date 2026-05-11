## Why

前两步提供了画像和推荐能力，但用户缺少一个"指挥中心"——看到 Agent 在做什么、Pipeline 健康状况、需要采取什么行动。Agent 仪表盘将首页从静态摘要升级为可交互的 Agent 指挥中心，同时将自动评估和健康告警集成进来，完成 V2.0 从"AI 辅助"到"AI 驱动"的体验闭环。

## What Changes

- 首页大改版为 Agent 仪表盘——推荐区、Pipeline 健康面板、待处理操作、最近动态四区布局
- 新增 JD 自动评估：用户粘贴 JD 后自动触发评估，无需手动点击"开始评估"
- 新增 Pipeline 健康告警：漏斗比例异常时主动提示（如"80% 申请在初筛阶段，建议暂停新投递"）
- 告警条件可配置，默认阈值：初筛阶段 > 70% 触发警告、某方向零回复 > 5 次触发警告
- 新增快速操作入口：一键跳转到最需要的操作（评估新 JD / 准备面试 / 跟进提醒）

## Capabilities

### New Capabilities

- `agent-dashboard`: Agent 仪表盘首页——推荐区 + Pipeline 健康 + 待处理操作 + 最近动态
- `auto-evaluate`: JD 自动评估——粘贴即评，无需手动触发

### Modified Capabilities

- `frontend-shell`: 首页完全重构成 Agent 仪表盘布局
- `ai-job-insights`: 扩展 Pipeline 健康检查，新增可配置告警阈值

## Impact

- 修改: 首页 page.tsx（大幅改版）、evaluate 页面（自动触发评估）
- 新增组件: DashboardLayout、PipelineHealthPanel、ActionCenter、RecentActivity
- 修改 API: `POST /api/analytics/health-check` 增加告警阈值参数
- 依赖: agent-smart-recommend（推荐引擎必须先完成）
