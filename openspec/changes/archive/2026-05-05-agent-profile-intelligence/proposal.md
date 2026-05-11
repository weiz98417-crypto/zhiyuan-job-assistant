## Why

Agent 聊天积累了用户大量信息，但 `profile_signals` 表始终为 0 行（信号写入完全依赖 AI 调 `mine_profile` 工具，模型经常跳过），导致求职画像页无数据可展示，只显示一个无上下文的 30 分。同时 Agent Chat 中 15 个工具名全为英文，中文用户体验差。三个问题本质相同：**系统收集了信息但没有有效呈现给用户。**

## What Changes

### 1. 信号自动提取 — 不依赖 AI 主动调用工具
- 在 Agent 对话的 `sendMessage` 中增加轻量信号扫描，每次用户发消息后自动提取技能提及、角色偏好、底线条件、公司偏好、薪资期望
- 扫描到信号后直接写入 `profile_signals` 表（绕过 AI 决策）
- 对话结束/切换会话时自动触发 `triggerProfileUpdate({ force: true })`
- `isDingwei` 正则放宽，覆盖更多自然语言表达

### 2. 画像页重设计 — 情报摘要优先于指标
- 画像页改为"情报摘要"布局：目标方向 → 提取到的技能 → 底线条件 → 公司偏好 → 竞争力概览 → 活动时间线
- 每个事实卡片标注来源（对话提取 / 手动添加 / 行为推断）
- 分数增加等级标签和维度说明，不再是裸数字
- 降低可视化门槛：雷达图从 3 次报告降到 1 次，技能缺口和偏好从 5 次降到 2 次

### 3. 工具名中文化
- 15 个工具名全部映射为中文标签 + emoji 图标
- `ToolResultCard` 和 `ExecutingIndicator` 两处同时生效
- 映射表集中在单一文件，方便维护

## Capabilities

### New Capabilities
- `profile-intelligence-display`: 画像页情报摘要布局，以具体事实卡片（目标、技能、底线、偏好）为主，分数为辅助参考
- `agent-signal-auto-extraction`: Agent 对话中自动扫描用户消息提取画像信号，不依赖 AI 主动调用 mine_profile 工具
- `tool-name-localization`: Agent Chat 中工具调用的中英文名称映射与展示

### Modified Capabilities
- `career-profile-ui`: 画像页展示需求变更——从指标仪表盘改为情报摘要，降低数据门槛，增加来源标注和引导文案
- `profile-auto-evolve`: 画像自动更新触发条件变更——增加对话结束/切换会话时的自动触发
- `agent-tools`: 工具结果展示需求变更——增加中文名和图标映射

## Impact

- **新增文件**: `frontend/src/lib/agent/signal-extractor.ts`（信号扫描器）, `frontend/src/lib/agent/tool-display-names.ts`（工具名映射表）
- **修改文件**: `frontend/src/app/agent/page.tsx`（信号扫描 + 对话结束触发更新）, `frontend/src/app/profile/page.tsx`（情报摘要布局）, `frontend/src/components/agent/AgentChat.tsx`（工具名中文化）, `frontend/src/lib/profile-update.ts`（降低缓存门槛）
- **API 影响**: 新增 `POST /api/data/signals/batch`（批量写入信号），修改 `/api/profile/analyze` 的 `force` 参数行为
- **数据库**: `profile_signals` 表现有 schema 不变
