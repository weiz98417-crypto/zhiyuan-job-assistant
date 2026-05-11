## 1. 工具名中文化（基础设施，改动小，先做）

- [x] 1.1 创建 `frontend/src/lib/agent/tool-display-names.ts`，包含 15 个工具的 `TOOL_DISPLAY` 映射表（{ label, emoji }）和 `getToolDisplay()` 函数
- [x] 1.2 修改 `frontend/src/components/agent/AgentChat.tsx` 中的 `ToolResultCard` 组件，头部显示 `{emoji} {中文名}` 替代英文 toolName，状态文案改为"完成"/"失败"
- [x] 1.3 修改 `ExecutingIndicator` 组件，"正在执行"后显示中文名+emoji
- [x] 1.4 AppShell 侧边栏导航中将 "AI Agent" 改为 "纸鸢Agent"

## 2. 信号自动提取（核心逻辑）

- [x] 2.1 新增 `frontend/src/app/api/data/signals/batch/route.ts` — POST 端点，接受 `{ signals: SignalEntry[] }` 批量写入 `profile_signals` 表
- [x] 2.2 创建 `frontend/src/lib/agent/signal-extractor.ts` — `scanMessage(content: string, sessionId: string): ExtractedSignal[]`，基于正则+关键词扫描 skill_claim / role_preference / dealbreaker / company_pref / salary_expectation
- [x] 2.3 修改 `frontend/src/app/agent/page.tsx` 的 `sendMessage` — 每条用户消息发送后调用 `scanMessage()`，结果批量 POST 到 `/api/data/signals/batch`
- [x] 2.4 信号扫描按会话去重——同一会话中相同内容的信号不重复写入
- [x] 2.5 放宽 `isDingwei` 正则，覆盖更多自然表达（如"找方向"、"迷茫"、"不知道做什么"、"帮我看看适合什么"）

## 3. 画像自动更新触发

- [x] 3.1 修改 `frontend/src/app/agent/page.tsx` 的 `handleSelectSession` / `handleNewSession` / `handleDeleteSession` — 切换会话前调用 `triggerProfileUpdate({ force: true })`
- [x] 3.2 修改 `frontend/src/lib/profile-update.ts` 的 `triggerProfileUpdate` — 支持 `force: true` 时完全绕过 24h 缓存（客户端和 /api/profile/analyze 均已支持）
- [x] 3.3 JD 评估完成后除现有更新外，额外扫描评估 JD 文本和用户反应提取信号

## 4. 画像页情报摘要布局（UI 重设计）

- [x] 4.1 修改 `frontend/src/app/profile/page.tsx` — 重排卡片顺序为：目标方向 → 核心技能 → 底线条件 → 偏好信号 → 竞争力概览 → 最近活动
- [x] 4.2 新增"目标方向"卡片 — 展示 `goals.targetRoles` 标签云 + `goals.dealBreakers`
- [x] 4.3 新增"核心技能"卡片 — 展示 `skills` 标签云，每个技能标注 `source`（对话提取/手动添加/行为推断）和 `evidence` 数量
- [x] 4.4 新增"底线条件"卡片 — 列表展示 dealBreakers，每项带 ✗ 图标
- [x] 4.5 新增"偏好信号"卡片 — 展示公司偏好（liked/disliked）、行业偏好、薪资范围
- [x] 4.6 改造"竞争力概览"卡片 — 添加进度条、等级标签（起步/积累中/有竞争力/具备竞争力/高度匹配）、维度分解条
- [x] 4.7 新增"最近活动"卡片 — 从 `history` 数组读取最近 10 条，显示时间、事件、来源标记

## 5. 降低可视化门槛

- [x] 5.1 雷达图门槛从 3 次报告降至：3 项技能或 1 次报告
- [x] 5.2 技能缺口门槛从 5 次报告降至：有 skillGaps 数据或 2 次报告
- [x] 5.3 偏好分布门槛从 5 次报告降至：preferences 有任意非零值
- [x] 5.4 每个卡片在无数据时显示引导文案（而非完全隐藏）

## 6. 验证

- [x] 6.1 在 Agent Chat 中发送包含技能/偏好/底线的消息，验证 `profile_signals` 表有新记录
- [x] 6.2 切换会话后访问 `/profile`，验证画像页展示新提取的数据
- [x] 6.3 验证工具结果卡片和执行指示器显示中文名+emoji
- [x] 6.4 验证分数等级标签和维度分解展示正常
