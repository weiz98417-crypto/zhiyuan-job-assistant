## Why

很多求职者连自己想找什么工作都不清楚——他们有经历但缺乏自我认知框架。现有的求职系统假设用户已经知道目标岗位，但缺乏一个"帮用户搞清楚自己要什么"的入口。这应该是整个求职流程的起点：通过大模型实时对话，逐步挖掘用户的经验、技能、偏好和约束，最终自动归纳成可操作的求职画像。

## What Changes

- 新增 `/explore` 页面：流式 AI 聊天界面，帮助用户探索求职方向
- 新增 `/api/chat/stream` API：DeepSeek 流式 SSE 代理，支持打字机效果
- 新增 `/api/chat/summarize` API：从对话历史中提取结构化求职画像（非流式 JSON）
- 聊天界面包含实时侧边栏：用户点击"帮我总结"后展示提取的求职画像
- 总结结果可直接保存到 `config/profile.yml` 和 `modes/_profile.md`
- AppShell 导航新增"需求探索"入口

## Capabilities

### New Capabilities
- `career-chat-streaming`: 流式 AI 聊天，AI 以自然对话方式引导用户梳理经验、技能、偏好和约束，前端实时渲染打字机效果
- `career-profile-extraction`: 从完整对话历史中提取结构化求职画像（目标岗位、技能清单、薪资范围、行业偏好、硬约束），输出到 profile 配置文件

### Modified Capabilities
<!-- None — this is a new feature, no existing specs change behavior -->

## Impact

- `frontend/src/app/explore/page.tsx` — 聊天页面（新文件）
- `frontend/src/app/api/chat/` — 两个 API 路由（新目录）
- `frontend/src/components/shell/AppShell.tsx` — 导航加一项入口
- `config/profile.yml` — 被总结结果写入（已有文件，追加字段）
- `modes/_profile.md` — 被总结结果写入（已有文件，追加内容）
