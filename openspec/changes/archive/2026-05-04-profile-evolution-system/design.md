## Context

当前系统的数据架构存在三重分裂：Markdown 文件（applications.md、reports/*.md、profile.yml）、SQLite（zhiyuan.db 中的 profiles/applications/reports/jds 表）、浏览器 DexieDB（12 张表）。三个数据源互不同步，不同代码路径读不同数据源：
- `profile-mining.ts` → 读 DexieDB
- `/api/data/profile` → 读 SQLite
- `dingwei.md` 对话 → 不写任何结构化数据

Skill 层同样断裂：`modes/zh/dingwei.md` 是精心设计的定位流程文档，但从未被任何 API 路由加载。实际 `/api/agent/chat` 加载的是 `frontend/skills/zhiyuan-explore.md`——一个"不调工具、不做分析、不写数据"的纯聊天 Skill。

Profile Engine 的 `mine_profile` 工具存在，但其 SOP 状态机只有 stage 0（A/B/C 选择题）和 stage 5（完成）有内容，stage 1-4 为空——意味着即使 Agent 正确调用了 mine_profile，也无法引导用户完成有意义的定位对话。

目标架构：SQLite 为唯一数据源 → API 层统一读写 → DexieDB 纯前端缓存 → dingwei Skill 驱动对话 + 写入信号 → Profile Engine 三层融合 → /profile 页面渐进展示。

## Goals / Non-Goals

**Goals:**
- 数据统一：所有读写走 SQLite API，DexieDB 仅做离线缓存和 UI 状态
- 初次定位：用户点击「自我定位」后 3-5 分钟获得包含目标岗位 + 核心优势 + 下一步行动的定位卡
- 迭代更新：再次进入定位时能感知上下文（画像历史 + 近期活动），按场景走不同对话路径
- 画像可见：初次定位完成后 /profile 页面立即展示基础画像，不空白
- 信号持久：每次 dingwei 对话中提取的结构化信号写入 `profile_signals` 表，可追溯

**Non-Goals:**
- 不在此变更中处理 interview-prep、cv-optimize 等其他 Skill 的重写
- 不更改 applications/reports/jds 三张表的现有 schema（只扩展 profiles 和新增 profile_signals）
- 不做服务端渲染（SSR）——/profile 仍为客户端的 API 拉取 + 渲染
- 不做离线优先（offline-first）——先保证在线体验正确，DexieDB 缓存同步是后续优化

## Decisions

### Decision 1: SQLite 统一数据层 → DexieDB 降级为缓存

**选择**: 所有数据写入走 Next.js API Routes → `server-db.ts`（better-sqlite3）→ zhiyuan.db。DexieDB 通过轮询 API 同步数据，用作 UI 渲染缓存和离线兜底。

**替代方案**:
- **保持 DexieDB 为主 + SQLite 为镜像**: 放弃了，因为浏览器端存储不可靠（用户清缓存丢失数据），且无法跨设备同步
- **纯 SQLite + 无 DexieDB**: 放弃了，因为 IndexedDB 可提供即时 UI 响应和离线能力，完全移除是过度设计

**原理**: `server-db.ts` 已经封装了 SQLite 读写，`/api/data/*` 路由已存在。扩展它们而非新建架构。

### Decision 2: Dingwei Skill 作为独立 Skill 文件

**选择**: 新建 `frontend/skills/zhiyuan-dingwei.md`（替换 `zhiyuan-explore.md`）。Skill 包含完整的初次定位 + 迭代更新逻辑，通过 System Prompt 注入给 DeepSeek。Agent 通过 `mine_profile` 工具执行结构化 SOP。

**替代方案**:
- **硬编码在 prompt.ts 中**: 放弃了，因为 Skill 文件独立于代码，支持热更新（改文件即生效，不需重新构建）
- **完全靠 Agent 自由对话**: 放弃了，因为无结构的自由对话导致当前问题（云里雾里、无产出）

**原理**: Skill 文件方式已被 `zhiyuan-explore/execute/agent` 验证，接口一致。改动范围小。

### Decision 3: 三层信号融合优先级

**选择**:
```
goals.*        ← 用户显式确认 > 对话信号 > 行为推断
skills.*       ← CV + 对话信号 + 评估反馈，三者合并去重
preferences.*  ← 行为推断为主，对话信号可覆盖，用户显式确认最高
marketFit.*    ← 纯行为数据计算，不与用户数据混合
```

**原理**: 
- goals 是用户主动设定的目标，必须用户确认才能变更——防止系统"擅自替用户改方向"
- skills 来自多个可信源，合并去重后展示
- preferences 是推断值，用户感受可能和行为不一致，所以行为推断优先但用户可纠正
- marketFit 是客观计算（投递数/通过率/平均分），不应被用户主观感受覆盖

### Decision 4: Profile Page 渐进展示

**选择**: `/profile` 页面从单一空白状态改为根据数据丰富度分层展示：

| 数据条件 | 展示内容 |
|----------|---------|
| 初次定位完成（goals 非空） | 目标岗位卡片 + 核心优势 + 下一步行动 + 进化轨迹 |
| 有 3+ 评估报告 | 技能雷达图出现 |
| 有 5+ 评估报告 | 偏好分布图出现 |
| 有面试练习记录 | 技能缺口分析出现 |

**原理**: 不等所有数据齐全才展示有价值的内容。每个阶段都有东西可看。

### Decision 5: Profile Signals 存储结构

**选择**: 新增 `profile_signals` 表，JSON 存储：

```sql
CREATE TABLE IF NOT EXISTS profile_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'dingwei',   -- 'dingwei' | 'evaluation' | 'interview'
  signal_type TEXT NOT NULL,               -- 'role_preference' | 'skill_claim' | 'dealbreaker' | 'company_pref' | 'salary_expectation'
  content_json TEXT NOT NULL DEFAULT '{}', -- e.g., {"role": "AI运营", "confidence": 0.8, "reason": "面试后发现产品太卷"}
  session_id TEXT,                         -- 关联的会话 ID
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**原理**: JSON 存储信号内容而非固定列——信号类型可能随 Skill 迭代而扩展，JSON 提供灵活性。`signal_type` 作为索引列支持按类型查询。

### Decision 6: 初次定位流程设计

**选择**: 结构化渐进式，3 阶段（摸底 → 深挖 → 定位卡），阶段之间有明确的推进条件：

- **Step 1-摸底**（1 轮）：A/B/C/D 四选一，用户回答后确定深挖路径
- **Step 2-深挖**（2-4 轮）：按路径从问题工具箱选牌，每轮只问一个问题，追问 > 新问题
- **Step 3-定位卡**（1 轮）：输出结构化的定位结果并确认
- **Step 4-写入**：调用 `PUT /api/data/profile` 写入 goals + history

每个阶段通过 `mine_profile` 工具的 `action=answer` 持久化用户回答，通过 `action=stage_prompt` 获取当前阶段引导语。

**与旧 dingwei.md 的关键区别**:
- 旧版: "跟能量走，不跟脚本走" → 新版: "结构化路径 + 灵活追问"
- 旧版: 最后用户自己总结 → 新版: Agent 输出定位卡供用户确认
- 旧版: 无工具调用 → 新版: 每轮调 mine_profile 记录 + 推进 SOP

### Decision 7: 迭代更新场景路由

**选择**: Agent 进入 dingwei 模式时，先读取 profile.goals 和 profile_signals，判断场景：

1. `profile.goals` 为空 → 初次定位流程
2. 用户消息包含明显的方向变化信号 → 场景 A（聚焦更新）
3. 系统计算的偏好与 goals 偏差 > 阈值 → 场景 B（提示漂移）
4. 用户消息是随意聊天 → 场景 C（自然对话，有信号才记录）
5. 用户提及具体事件（面试/评估/offer） → 场景 D（事件反思）

## Risks / Trade-offs

- **[R] DexieDB → SQLite 迁移可能丢失用户本地数据** → 迁移脚本先读 DexieDB 全量数据写入 SQLite，再做同步。迁移完成前 DexieDB 保留作为恢复源
- **[R] better-sqlite3 是同步 API，阻塞 Event Loop** → 当前数据量级（<1000 条）下同步读写耗时 <1ms。如果未来数据增长，迁移到异步 SQLite（如 `sqlite-async`）或加 Worker Thread
- **[R] Skill 从自由聊天改为结构化流程，可能失去"朋友感"** → 定位流程只在「自我定位」入口触达。探索 Tab 的默认对话仍保持轻量聊天风格，只在用户明确要定位时切换
- **[R] profile_signals 表随时间膨胀** → 每次 dingwei 对话产生 5-10 条信号。按每日 3 次对话估算，一年约 5000 条。SQLite 完全可以承受。添加定期清理（>90 天的低置信度信号自动归档）
- **[R] 三层融合的权重调优依赖经验** → 第一版用规则权重，后续可基于用户反馈（"这个不对"）自动调整

## Open Questions

1. **初次定位完成后是否自动跳转到 /profile 页面？** 建议：在对话中展示定位卡 + "去看看你的画像？"链接，不强制跳转
2. **profile.yml 和 profile.goals 冲突时以谁为准？** 建议：profile.yml 作为初始导入源，导入后用户通过 dingwei 对话修改的不回写 profile.yml（单向流）
3. **偏好漂移阈值怎么定？** 建议第一版：最近 5 个 JD 评估中某个非目标 archetype 平均分 > 目标 archetype 平均分 + 0.5，触发提示
