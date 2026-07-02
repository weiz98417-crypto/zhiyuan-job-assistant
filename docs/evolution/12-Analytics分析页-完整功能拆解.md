# 12 -- Analytics 分析页完整功能拆解

> 页面: `src/app/analytics/page.tsx` (约 566 行) | 核心算法: `lib/analytics.ts` | API: `/api/analytics/*` x 2 | 数据: repository-backed；当前 LAN 为 PostgreSQL

---

## 功能清单

| # | 功能 | 实现 | 数据源 |
|---|------|------|--------|
| 1 | 漏斗图 | `computeFunnel()` | applications 表 + 状态归一化 |
| 2 | 分数分布 | 前端分组统计 | reports/applications |
| 3 | 周趋势图 | `generateWeeklyData()` | repository 数据 + Date.now() |
| 4 | 跟进分析 | `analyzeFollowUps()` + `computeUrgency()` | repository 数据 + 日期计算 |
| 5 | 转化率指标 | 阶段间除法 | repository 数据 |
| 6 | 时间区间切换 | `timeRange: "4w"/"8w"/"all"` | 前端状态 |
| 7 | AI 洞察 | DeepSeek 生成建议 | 触发条件：数据 > 5 条 + 手动 |
| 8 | Pipeline 健康检查 | `/api/analytics/health-check` + `check_pipeline_health` 工具 | DeepSeek 分析 repository 数据 |
| 9 | 周报生成 | `/api/analytics/weekly-report` | DeepSeek + repository 聚合 |

---

## 数据架构

```
Analytics 页面
├─ 数据加载: 优先通过 API 读取 repository，Dexie 作为本地 fallback
│   └─ 当前 LAN 权威源: PostgreSQL；SQLite 仅 fallback/archive
├─ 指标计算: 纯前端 (lib/analytics.ts)
│   ├─ computeFunnel()     -- 漏斗分析
│   ├─ analyzeFollowUps()  -- 跟进建议
│   └─ computeUrgency()    -- 紧急性评级
├─ AI 洞察: POST /api/analytics/health-check
│   └─ DeepSeek 分析 Pipeline 健康状况 → green/yellow/red/gray
└─ 周报: POST /api/analytics/weekly-report
    └─ DeepSeek 生成结构化周报
```

---

## 功能拆解

### 1. 漏斗图 (`computeFunnel()`)

**算法** (`lib/analytics.ts:164`)：

```
输入: 所有应用的 status 数组
阶段: Evaluated → Applied → Responded → Interview → Offer

计算:
  stage[N].count = applications 中状态 ≥ stage[N] 的数量 (累积计数)
  stage[N].rate  = stage[N].count / stage[N-1].count × 100%

示例:
  100 评估 → 60 投递 → 20 回复 → 8 面试 → 2 Offer
  转化率:          60%         33%        40%        25%
```

```typescript
export function computeFunnel(statuses: string[], stageOrder = FUNNEL_STAGES): FunnelStage[] {
  return stageOrder.map((stage, idx) => {
    const count = statuses.filter(s =>
      stageOrder.indexOf(normalizeStatus(s)) >= stageOrder.indexOf(stage)
    ).length;
    const rate = idx > 0
      ? Math.round((count / prevCount) * 100)
      : 100;
    return { stage, count, rate };
  });
}
```

### 2. 分数分布

前端纯计算，按分数区间分组（数据来自 reports 表）：

| 区间 | 含义 |
|------|------|
| 4.5-5.0 | 强匹配 |
| 4.0-4.4 | 好匹配 |
| 3.5-3.9 | 一般 |
| <3.5 | 弱匹配 |

每个区间显示计数 + 占比柱状条。

### 3. 周趋势图

```typescript
// 时间区间控制
const weeks = timeRange === "4w" ? 4 : 8;

// 每周统计
for (let i = weeks - 1; i >= 0; i--) {
  const weekStart = new Date(nowRef - (i + 1) * 7 * 86400000);
  const weekEnd = new Date(nowRef - i * 7 * 86400000);
  // 过滤该周内的 applications → 统计 applied/interview/offer 数量
}
```

**实现细节**：
- `nowRef` 在 render 时捕获一次（`useMemo` 依赖 `[applications, timeRange, nowRef]`）
- 三线并排数据：投递数(applied) / 面试数(interview) / offer数(offer)
- 支持 4 周/8 周切换

### 4. 跟进分析 (`analyzeFollowUps()`)

**算法** (`lib/analytics.ts:199`)：

对每个可操作的应用（非 SKIP/Discarded/Rejected），计算跟进紧急性：

```typescript
function computeUrgency(status, daysSinceApp, daysSinceLastFollowup, followupCount) {
  if (status === "applied") {
    if (followupCount >= MAX_FOLLOWUPS) return "cold";        // 已跟进足够多次
    if (followupCount === 0 && daysSinceApp >= FIRST_FOLLOWUP) return "overdue";
    if (daysSinceLastFollowup >= SUBSEQUENT_FOLLOWUP) return "overdue";
    return "waiting";
  }
  if (status === "responded") {
    if (daysSinceApp < RESPONDED_INITIAL) return "urgent";   // 刚回复，立即处理
    if (daysSinceApp >= RESPONDED_SUBSEQUENT) return "overdue";
    return "waiting";
  }
}
```

**四级紧急性**：

| 等级 | 含义 | 触发条件示例 |
|------|------|-------------|
| `urgent` | 立即处理 | 公司已回复且 < 7 天未跟进 |
| `overdue` | 已超时 | 投递 > 7 天无回复且未跟进 |
| `waiting` | 等待中 | 投递后正常等待期 |
| `cold` | 已冷却 | 评估 > 14 天未投递或跟进已达上限 |

### 5. 转化率指标

两个基础指标（数据来自 repository API）：
- 评估 → 投递转化率 = applied / evaluated
- 投递 → 面试转化率 = interview / applied

显示当前值 + 环比变化。

### 6. 时间区间切换

```typescript
const [timeRange, setTimeRange] = useState<"4w" | "8w" | "all">("8w");
```

三个选项影响漏斗图、周趋势图、分数分布的数据范围。

### 7. AI 洞察

触发条件：applications > 5 条时显示"生成AI洞察"按钮。

点击后调用 DeepSeek API，输入上下文：
- 当前漏斗各阶段数据
- 平均分数
- 最近一周活动

生成 3-5 条针对性建议，如"投递转化率偏低(30%), 建议提高评估分数>=4.0才投递的阈值"。

### 8. Pipeline 健康检查 (`/api/analytics/health-check`)

**Agent 工具**: `check_pipeline_health` (query 类工具，`src/lib/agent/tools/query/check-pipeline-health.ts`)

**API 端点**: `POST /api/analytics/health-check`

两种调用路径：
- **Agent 对话中**: 通过 `check_pipeline_health` 工具 → 读取 applications 表 → 返回 overdue 列表 + 健康度
- **Analytics 页面**: 通过 `/api/analytics/health-check` API → DeepSeek 深度分析

**API 输入**：
```json
{
  "pipeline": {
    "applications": [
      { "company": "...", "role": "...", "status": "...", "daysSinceApplied": 5, "daysSinceLastActivity": 2 }
    ]
  },
  "thresholds": {
    "evalWarningPct": 70,
    "evalDangerPct": 80,
    "zeroReplyCount": 5,
    "staleDays": 14
  }
}
```

**API 输出**：
```json
{
  "success": true,
  "data": {
    "status": "green",     // green | yellow | red | gray
    "score": 80,           // 0-100
    "issues": ["3 份申请超过 14 天无回复，建议跟进"],
    "suggestions": ["建议暂停新投递，集中跟进现有 Pipeline"]
  }
}
```

**检查维度**：
- 漏斗分布：各阶段分布是否健康
- 转化率：投递 → 回复 → 面试的转化是否正常
- 停滞风险：是否有长期未更新的申请
- 方向集中度：是否过度集中在某一类岗位

**告警阈值**：
- 初筛阶段占比 >= 70% → 黄色警告
- 初筛阶段占比 >= 80% → 红色告警
- 某方向连续 5+ 次零回复 → 红色告警
- 申请超过 14 天无活动 → 停滞

### 9. 周报生成 (`/api/analytics/weekly-report`)

`POST /api/analytics/weekly-report` -- DeepSeek 生成结构化周报：

- 本周新增投递数
- 本周新增面试数
- 转化率变化趋势
- 跟进建议
- 下周行动计划

---

## 前端渲染组件

| 组件 | 功能 | 位置 |
|------|------|------|
| 漏斗可视化 | 横向柱状图 + 转化率标签 | 内联渲染 |
| 分数分布 | 分组柱状条 + 百分比 | 内联渲染 |
| 周趋势图 | 三线数据表（投递/面试/Offer） | 内联渲染 |
| 跟进列表 | 按紧急性分组 + 操作按钮 | 内联渲染 |
| 健康检查面板 | green/yellow/red/gray 配色 + issues 列表 | 内联渲染 |
| 时间区间切换 | 3 按钮切换组 | 页面顶部 |
| AI 洞察面板 | 可折叠建议列表 | 内联渲染 |
