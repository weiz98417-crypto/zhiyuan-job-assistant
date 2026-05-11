# 12 — Analytics 分析页完整功能拆解

> 页面: `frontend/src/app/analytics/page.tsx` (566 行) | 核心算法: `lib/analytics.ts`

---

## 功能清单

| # | 功能 | 实现 | 数据源 |
|---|------|------|--------|
| 1 | 漏斗图 | `computeFunnel()` | IndexedDB + 状态归一化 |
| 2 | 分数分布 | 前端分组统计 | IndexedDB |
| 3 | 周趋势图 | `generateWeeklyData()` | IndexedDB + Date.now() |
| 4 | 跟进分析 | `analyzeFollowUps()` + `computeUrgency()` | IndexedDB + 日期计算 |
| 5 | 转化率指标 | 阶段间除法 | IndexedDB |
| 6 | 时间区间切换 | `timeRange: "4w"/"8w"/"all"` | 前端状态 |
| 7 | AI 洞察 | DeepSeek 生成建议 | 触发条件：数据>5条 + 手动 |

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

前端纯计算，按分数区间分组：

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
| `urgent` | 立即处理 | 公司已回复且<7天未跟进 |
| `overdue` | 已超时 | 投递>7天无回复且未跟进 |
| `waiting` | 等待中 | 投递后正常等待期 |
| `cold` | 已冷却 | 评估>14天未投递或跟进已达上限 |

### 5. 转化率指标

两个基础指标：
- 评估→投递转化率 = applied/evaluated
- 投递→面试转化率 = interview/applied

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

生成 3-5 条针对性建议，如"投递转化率偏低(30%), 建议提高评估分数≥4.0才投递的阈值"。
