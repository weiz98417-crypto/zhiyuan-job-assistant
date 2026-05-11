## Why

当前「自我定位」功能存在三重断裂：dingwei.md 设计精良但从未被 API 加载、mine_profile SOP 是空壳（只有 1/5 阶段有内容）、对话数据完全不参与画像生成——导致用户聊完半小时后 /profile 页面仍是空白。更根本的问题是：画像系统是一次性的（依赖投递统计数据），而非持续进化的（结合对话信号）。用户无法在初次定位后通过后续对话迭代自己的求职画像。

## What Changes

- **BREAKING**: DexieDB 降级为纯前端缓存层，所有数据写入统一走 SQLite API，DexieDB 不再作为数据源
- **BREAKING**: 删除 `frontend/skills/zhiyuan-explore.md` 的朋友聊天模式，替换为 dingwei 定位 Skill
- 新增初次定位流程：结构化渐进式（状态摸底 → 路径深挖 → 定位卡输出 → 写入画像），3-5 分钟出结果
- 新增迭代更新流程：再入时读取上下文（画像变更历史 + 最近活动）→ 按场景分流（新认知/偏好漂移/随意聊聊/事件触发）
- 新增 profile_signals 表：存储每次 dingwei 对话中提取的结构化信号，作为画像融合的数据源之一
- 重写 Profile Engine 为三层信号融合：Layer 1 显式声明（profile.yml，最高优先级）→ Layer 2 对话信号（profile_signals 表）→ Layer 3 行为数据（applications/reports 统计推断）
- `/profile` 页面在初次定位完成后立即展示基础画像（目标岗位、核心优势、下一步行动），不再显示空白页
- mine_profile SOP 补全 stage 1-4 的问题和分支逻辑

## Capabilities

### New Capabilities
- `dingwei-positioning`: 自我定位 Skill 的完整流程——初次定位的结构化渐进式对话 + 迭代更新的按场景分流对话。输出定位卡并写入画像 goals 字段
- `profile-data-layer`: SQLite 为单一数据源的统一数据层。所有 API 读写走 SQLite，DexieDB 仅保留离线缓存。新增 profile_signals 表存储对话提取信号
- `profile-signal-engine`: 三层信号融合引擎——显式声明（profile.yml）> 对话信号（profile_signals）> 行为推断（applications/reports 统计）。不同画像字段适用不同优先级规则

### Modified Capabilities
- `profile-settings-ui`: /profile 页面内容策略改为渐进式——初次定位后展示基础画像（目标 + 优势 + 下一步），随数据累积逐步展示技能雷达/偏好分布/技能缺口
- `sqlite-backend`: Schema 扩展——新增 profile_signals 表，profiles 表增加 goals_json 字段分离目标与其他数据
- `agent-profile-sop`: 补全 mine_profile SOP 的 stage 1-4 问题定义和分支逻辑（当前仅 stage 0 和 stage 5 有内容）
- `explore-chat-ui`: 探索 Tab 从加载 zhiyuan-explore.md 改为加载 dingwei Skill，对话内容有结构和产出
- `profile-auto-evolve`: profile-mining 引擎重写——从仅读 DexieDB 统计数据改为从 SQLite 读三层信号做融合
- `career-profile`: ZhiyuanProfile 数据模型更新——goals 字段独立存储，新增 signalSummary 字段展示最近采集的信号

## Impact

- **前端**: `profile-mining.ts`、`profile-sop.ts`、`profile-update.ts`、`profile-storage.ts` 重写；`/app/profile/page.tsx` 内容策略更新；SuggestionChips 中「自我定位」prompt 更新
- **API**: `/api/data/profile` 扩展为读写 goals+signals；新增 `/api/data/signals` 端点；`/api/profile/analyze` 改为服务端运行
- **Skill**: 删除 `frontend/skills/zhiyuan-explore.md`；新增 `frontend/skills/zhiyuan-dingwei.md`
- **数据库**: SQLite schema 新增 `profile_signals` 表；`profiles` 表结构扩展
- **无破坏性**: 现有 applications/reports/jds 数据路径不变；profile.yml 继续作为 Layer 1 使用
