# Analytics 求职数据分析系统的产品构造

Analytics 求职数据分析系统负责把用户的投递记录、评估结果、面试进展和 Offer 结果转成可行动的求职判断。它不是为了展示图表，而是为了回答用户真正关心的问题：我的求职漏斗健康吗？哪些机会该跟进？哪个阶段卡住了？下一周应该调整方向还是继续扩大投递？

在纸鸢里，Analytics 是投递追踪系统的上层解释层。投递追踪负责记录状态，Analytics 负责把状态变成判断。

## 1. 产品定位

Analytics 的核心产品目标是：让用户从“感觉求职不顺”变成“知道问题卡在哪一层”。

它关注的是求职过程中的几个关键问题：

| 用户问题 | Analytics 给出的判断 |
|---|---|
| 本周有没有推进 | 本周新投递、新面试、新 Offer |
| 投递是否有效 | 投递到回复、回复到面试、面试到 Offer 的漏斗 |
| 是否需要跟进 | 投递超过 7 天、回复后未推进、面试后未感谢 |
| 是否方向有问题 | 回复率低、拒绝集中、顶部漏斗堆积 |
| 是否有停滞风险 | 超过 14 天无活动的申请 |
| 能否预期 Offer | 当前面试中和已回复机会的数量 |

这个系统不替用户做所有决定，但会把求职过程中的隐性风险显性化。

## 2. 页面入口

Analytics 页面是 `src/app/analytics/page.tsx`。

页面当前直接从 Dexie 读取：

```ts
const apps = await db.applications.toArray();
```

这说明 Analytics 的主要数据源是浏览器本地 `applications`，而不是服务端聚合 API。页面中的图表、提醒和洞察都围绕这批 `Application` 数据计算。

页面包含以下模块：

| 模块 | 页面展示 | 数据来源 |
|---|---|---|
| 时间范围 | 4周、8周、全部 | `timeRange` |
| 转化漏斗 | evaluated/applied/responded/interview/offer | `computeFunnel()` |
| 本周摘要 | 新投递、新面试、新 Offer、周环比 | `applications` 日期和状态 |
| 拒绝模式分析 | 技能不匹配、经验不足、薪资期望等 | 当前是基于 rejected 数量的比例估算 |
| 8周趋势 | 投递、面试、Offer 堆叠柱 | `weeklyData` |
| Pipeline 健康灯 | green/yellow/red/gray | 页面内回复率计算 |
| 异常检测 | 超过 14 天无活动的申请 | `updatedAt` 和状态 |
| Offer 预测 | 基于面试中和已回复机会 | 页面内启发式文案 |
| AI 周报 | POST `/api/analytics/weekly-report` | DeepSeek JSON 输出 |
| 跟进提醒 | overdue/urgent/waiting/cold | `analyzeFollowUps()` |

## 3. 数据来源

Analytics 的基础数据是 `Application`。

关键字段包括：

| 字段 | 用途 |
|---|---|
| `date` | 计算本周、本周趋势和投递间隔 |
| `status` | 漏斗、通过率、跟进提醒、健康灯 |
| `score` | 周报中作为机会质量输入 |
| `company` | 跟进提醒、周报和异常展示 |
| `role` | 跟进提醒、周报和异常展示 |
| `updatedAt` | 判断长期无活动 |
| `interviews` | 投递追踪里记录轮次，当前 Analytics 页面未深度使用 |

状态定义来自 `src/types/index.ts`：

```text
evaluated -> applied -> responded -> interview -> offer
rejected / discarded / skip
```

这套状态决定了 Analytics 的计算口径。如果投递追踪里的状态混乱，Analytics 的图表就会失真。

## 4. 漏斗计算

漏斗计算在 `src/lib/analytics.ts` 的 `computeFunnel()`。

它的阶段默认是：

```text
evaluated, applied, responded, interview, offer
```

计算方式不是简单统计某个状态出现几次，而是“到达某阶段及以后”的累计口径：

```text
某阶段 count =
  所有 status 在阶段顺序中位置 >= 当前阶段位置的记录数
```

例如一个状态为 `interview` 的机会，会被计入：

- evaluated
- applied
- responded
- interview

但不会计入 offer。

这种累计口径符合求职漏斗的含义：进入面试说明它已经经历过投递和回复阶段。

转化率计算为：

```text
当前阶段累计数 / 上一阶段累计数
```

页面把这些结果画成转化漏斗，每个阶段展示数量和转化率。

## 5. 本周摘要与趋势

页面用当前时间向前切分周维度。

本周摘要计算：

| 指标 | 计算方式 |
|---|---|
| 新投递 | 近 7 天内 `status === applied` |
| 新面试 | 近 7 天内 `status === interview` |
| 新 Offer | 近 7 天内 `status === offer` |
| 投递环比 | 本周 applied 与上周 applied 对比 |

8 周趋势使用 `weeklyData`：

```text
每周 applied 数
每周 interview 数
每周 offer 数
```

页面用 CSS 堆叠柱展示。它不是复杂 BI，而是求职节奏监控：用户能看到最近几周是在变多、变少，还是卡住。

## 6. 跟进提醒

跟进提醒来自 `analyzeFollowUps()`。

核心节奏配置是：

```ts
appliedFirst: 7
appliedSubsequent: 7
appliedMaxFollowups: 2
respondedInitial: 1
respondedSubsequent: 3
interviewThankyou: 1
```

对应产品含义：

| 状态 | 节奏 | 判断 |
|---|---|---|
| `applied` | 第一次投递后 7 天 | 超过则 `overdue` |
| `applied` | 已跟进后再过 7 天 | 可再次跟进 |
| `applied` | 最多 2 次跟进 | 超过后 `cold` |
| `responded` | 1 天内 | 需要快速响应，`urgent` |
| `responded` | 3 天后 | 未推进则 `overdue` |
| `interview` | 1 天后 | 需要感谢或复盘 |

当前页面传给 `analyzeFollowUps()` 的 `followups` 是空数组，因此提醒主要基于投递日期和状态，而不是完整跟进历史。这个边界要明确：系统已经有跟进节奏算法，但还没有把真实 followup 记录完整沉淀进 `applications`。

## 7. Pipeline 健康灯

页面内计算健康灯的逻辑是：

```text
applied = 状态在 applied/responded/interview/offer 的数量
replied = 状态在 responded/interview/offer 的数量
rate = replied / applied
```

然后按回复率给灯：

| 条件 | 灯色 | 文案含义 |
|---|---|---|
| rate >= 0.4 | green | 漏斗健康 |
| rate >= 0.2 | yellow | 回复率偏低，建议优化 |
| applied > 0 且 rate < 0.2 | red | 回复率显著偏低 |
| 没有 applied | gray | 暂无足够数据 |

这个健康灯不是严格统计模型，而是求职节奏提示。它让用户快速知道当前 pipeline 是否值得继续按原策略推进。

## 8. 异常检测

异常检测当前聚焦一个明确场景：

```text
状态为 applied 或 evaluated
并且 updatedAt 超过 14 天没有变化
```

如果命中，页面展示：

```text
N 份申请超过 14 天无回复，建议跟进或归档
```

如果没有命中，展示：

```text
未发现异常，所有申请均在正常时间线内
```

这类异常检测的产品价值是把“我好像忘了跟进”变成可见提醒。

## 9. AI 周报

AI 周报接口是 `src/app/api/analytics/weekly-report/route.ts`。

页面点击“生成 AI 周报”后，会向接口发送：

```json
{
  "stats": {
    "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "applications": [
      { "company": "公司", "role": "岗位", "status": "applied", "score": 4.1 }
    ],
    "interviews": [],
    "offerCount": 0
  }
}
```

接口会：

1. 调用 `getCurrentUser()` 做登录校验。
2. 调用 `checkApiKey()` 校验模型服务配置。
3. 计算本周非 skip/discarded 的申请数。
4. 计算通过筛选数：`responded`、`interview`、`offer`。
5. 调用 `callDeepSeekJson()` 要求模型返回结构化 JSON。
6. 用 `parseJsonResponse()` 解析结果。
7. 返回 `stats`、`trends`、`aiCommentary`、`encouragement`。

AI 周报的价值不是重复图表，而是把一周动作转成解释和建议。

## 10. Pipeline 健康检查 API

项目还有 `src/app/api/analytics/health-check/route.ts`。

这个接口接收：

```json
{
  "pipeline": {
    "applications": [
      {
        "company": "公司",
        "role": "岗位",
        "status": "applied",
        "daysSinceApplied": 8,
        "daysSinceLastActivity": 8
      }
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

它让模型基于漏斗分布、转化率、停滞风险和方向集中度返回：

- `status`: green/yellow/red/gray
- `score`: 0-100
- `issues`
- `suggestions`

当前 Analytics 页面主要在前端内部计算健康灯，并没有把所有健康检查都委托给这个接口。这个接口更像是 server-side AI 诊断能力，适合未来接入 Agent 或后台周报。

## 11. 拒绝模式分析的真实边界

页面里有一个“拒绝模式分析”模块。

当前实现不是从真实拒绝原因字段中读取数据，而是对 `rejected.length` 做比例估算：

```text
技能不匹配 40%
经验不足 25%
薪资期望过高 15%
位置限制 10%
其他原因 10%
```

这意味着它现在是占位型分析，不是真实归因系统。要把它做成正式能力，需要在投递追踪或面试复盘里采集真实拒绝原因。

文档必须把这个边界写清楚，否则会误导读者以为项目已经有完整拒绝原因挖掘。

## 12. 当前边界

Analytics 系统当前已经具备：

- 基于 `applications` 的漏斗计算。
- 本周摘要和 4/8 周趋势。
- 基于节奏规则的跟进提醒。
- Pipeline 健康灯。
- 14 天无活动异常检测。
- 基于模型的 AI 周报接口。
- 基于模型的 health-check 接口。

同时也存在边界：

1. 页面数据主要来自本地 Dexie，不是服务端聚合。
2. followup 历史目前没有完整沉淀，提醒主要靠日期推断。
3. 拒绝模式分析是估算，不是从真实拒绝原因字段得出。
4. Offer 预测是启发式文案，不是统计模型。
5. 页面内健康灯和 `/api/analytics/health-check` 还没有统一成同一套诊断结果。
6. 时间计算依赖当前渲染时刻，适合产品提醒，不适合严肃 BI 审计。

这些边界决定了 Analytics 更接近“求职驾驶舱”，而不是企业级数据仓库。

## 13. 失败模式

| 失败模式 | 当前处理 |
|---|---|
| 没有投递数据 | 展示空状态，引导先评估和投递 |
| 模型 API key 未配置 | `/api/analytics/weekly-report` 或 health-check 返回配置错误 |
| 周报 JSON 解析失败 | 接口 catch 后返回周报生成失败 |
| 本地 date 格式异常 | followup 分析跳过无法解析日期的记录 |
| applied 数为 0 | 健康灯显示 gray 或通过率显示 `—` |
| `updatedAt` 缺失或异常 | 异常检测可能失准，需要数据写入侧保证 |

产品判断上，Analytics 不能在数据不足时强行输出确定结论。空数据和低置信度本身就是一种状态。

## 14. 验证依据

相关项目文件包括：

- `src/app/analytics/page.tsx`
- `src/lib/analytics.ts`
- `src/app/api/analytics/weekly-report/route.ts`
- `src/app/api/analytics/health-check/route.ts`
- `src/app/tracker/page.tsx`
- `src/types/index.ts`
- `src/lib/db.ts`

验证重点包括：

- `computeFunnel()` 是否按累计漏斗计算。
- `normalizeStatus()` 是否处理历史别名。
- `analyzeFollowUps()` 是否能输出 urgent/overdue/waiting/cold。
- 空数据页面是否不展示假图表。
- 时间范围切换是否影响趋势图。
- 周报接口是否做登录和 API key 校验。
- 健康检查接口是否能对空 pipeline 返回 gray。

## 15. 产品总结

Analytics 求职数据分析系统把投递记录转成求职决策。

它不是为了让页面看起来更丰富，而是为了让用户知道：机会池是否健康、哪一批申请该跟进、哪些阶段转化差、本周节奏是否下降、下一步要扩大投递还是优化简历。它的基础是投递追踪系统里的状态数据；它的输出是用户下一步行动的判断依据。
