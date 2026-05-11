## 1. SQLite Schema & API 扩展

- [x] 1.1 扩展 SQLite schema：新增 profile_signals 表 + profiles 表增加 goals_json 列
- [x] 1.2 更新 `server-schema.sql`，确保 CREATE TABLE IF NOT EXISTS 语法兼容
- [x] 1.3 在 `server-db.ts` 新增 profile_signals 读写函数（insertSignal / querySignals / listSignals）
- [x] 1.4 在 `server-db.ts` 新增 getProfileGoals / upsertProfileGoals 函数
- [x] 1.5 新增 `/api/data/signals` 路由（GET 查询信号，POST 写入信号）
- [x] 1.6 扩展 `/api/data/profile` 路由：GET 返回分离的 data + goals；PUT 支持独立更新 goals_json
- [x] 1.7 扩展 `/api/data/import` 路由：profile.yml 导入时写入 goals_json

## 2. Profile Engine 服务端化

- [x] 2.1 将 `profile-mining.ts` 核心逻辑迁移为服务端版本（读 SQLite → LLM 推断 → 写 SQLite）
- [x] 2.2 实现三层信号融合逻辑：Layer 1（profile.yml）> Layer 2（profile_signals）> Layer 3（行为统计）
- [x] 2.3 改写 `/api/profile/analyze`：服务端调用 DeepSeek API，从 SQLite 获取全量数据
- [x] 2.4 实现 goals 保护逻辑：用户确认的 goals 不被行为数据覆盖（除非 force + 用户确认）
- [x] 2.5 前端 `triggerProfileUpdate` 改为调用 `/api/profile/analyze`（POST），不再直接调 `profile-mining`
- [x] 2.6 前端新增 API 结果 → DexieDB 缓存同步逻辑（`syncProfileToCache`）
- [x] 2.7 删除前端的 `profile-mining.ts` 中 LLM 调用部分（仅保留服务端版本）

## 3. Dingwei Skill 重写

- [x] 3.1 创建 `frontend/skills/zhiyuan-dingwei.md`：包含初次定位流程 + 迭代更新流程 + 问题工具箱
- [x] 3.2 在 `skill-loader.ts` 注册 dingwei skill 名称（或确认自动发现机制）
- [x] 3.3 更新 `/api/agent/chat`：支持 mode="dingwei" 参数，加载 zhiyuan-dingwei.md
- [x] 3.4 更新 SuggestionChips："自我定位" chip 点击后携带 mode="dingwei"
- [x] 3.5 删除 `frontend/skills/zhiyuan-explore.md`（或重命名为 zhiyuan-dingwei.md 后改写）

## 4. mine_profile SOP 完善

- [x] 4.1 补全 `profile-sop.ts` stage 1-4 的问题定义
- [x] 4.2 补全 stage 2-3 的深挖问题（按分支路径差异化）
- [x] 4.3 补全 stage 4 的收尾引导语（定位卡输出提醒）
- [x] 4.4 mine_profile tool 增加 `action=complete`：触发最终画像写入
- [x] 4.5 mine_profile tool 增加 `action=stage_prompt`：返回当前阶段引导语

## 5. 初次定位流程

- [x] 5.1 `zhiyuan-dingwei.md` 中实现初次定位入口检测（profile.goals 为空 → 进入初次定位流程）
- [x] 5.2 实现状态摸底阶段：A/B/C/D 四选一 + 分支路由
- [x] 5.3 实现四条深挖路径的问题工具箱（每条路径 5-8 个可选问题）
- [x] 5.4 实现定位卡输出模板：目标方向 + 匹配依据 + 推荐试投 + 下一步
- [x] 5.5 实现定位卡确认 → mine_profile complete → 写 SQLite goals

## 6. 迭代更新流程

- [x] 6.1 `zhiyuan-dingwei.md` 中实现再入检测（profile.goals 非空 → 进入迭代流程）
- [x] 6.2 实现上下文展示：读取上次更新时间 + 近期活动摘要 + 偏好漂移指标
- [x] 6.3 实现场景 A（用户带新认知）：深挖 1-2 轮 → 确认变更 → 更新 goals
- [x] 6.4 实现场景 B（偏好漂移检测）：最近 5 个 JD 评估中非目标 archetype 分高于目标 0.5+ → 提示
- [x] 6.5 实现场景 C（随意聊聊）：轻量对话 + 有信号才记录 → profile_signals
- [x] 6.6 实现场景 D（事件触发）：围绕具体事件做结构化反思
- [x] 6.7 实现信号持续记录：每轮对话调 mine_profile action=answer

## 7. Profile 页面改造

- [x] 7.1 实现渐进式内容展示逻辑：根据 goals/skills/reports 数据量决定展示哪些组件
- [x] 7.2 实现「初次定位后基础画像」视图：目标岗位卡片 + 核心优势 + 下一步行动 + 进化轨迹
- [x] 7.3 实现组件门槛规则：SkillRadar（≥3 评估）、PreferenceBars（≥5 评估）、SkillGapList（有面试或 ≥5 评估）
- [x] 7.4 改装空白状态：引导卡片 + 「自我定位」快捷按钮，替换纯文字提示
- [x] 7.5 EvolutionTimeline 增强：每条记录展示来源标记（dingwei/evaluation/auto）
- [x] 7.6 Profile 页面数据源从 DexieDB 直接读取改为 API 优先 + DexieDB 缓存兜底

## 8. 前后端数据同步

- [x] 8.1 确认 DexieDB 所有写入路径，替换为 API 调用
- [x] 8.2 实现 DexieDB 缓存预热：页面加载时从 API 拉取最新数据写入 DexieDB
- [x] 8.3 实现离线兜底：API 不可用时 DexieDB 缓存数据维持 UI 可用
- [x] 8.4 移除 `profile-storage.ts` 中的直接 DexieDB 写入逻辑（saveProfile → 改为 API PUT）
- [x] 8.5 移除 `profile-mining.ts` 中的 DexieDB 读取逻辑（computeStats etc. → 改为 API 读取）

## 9. 清理 & 验证

- [x] 9.1 删除 `frontend/skills/zhiyuan-explore.md`（被 dingwei skill 替代）
- [x] 9.2 验证：从零开始 → 初次定位 → /profile 展示基础画像
- [x] 9.3 验证：有画像后再次进入定位 → 展示上下文 + 场景路由
- [x] 9.4 验证：JD 评估后 → 画像自动更新 → EvolutionTimeline 新增记录
- [x] 9.5 验证：DexieDB 离线缓存 → API 不可用时 UI 仍可渲染
- [x] 9.6 TypeScript 编译通过，无类型错误
- [x] 9.7 前端 build 通过（`cd frontend && npm run build`）
