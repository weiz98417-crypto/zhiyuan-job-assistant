## Context

V1.5 已经通过 DexieDB 存储了 applications、reports、stories、practiceRecords、jds 等数据，localStorage 存有 CV、profile、chat 历史。但这些数据从未被关联分析。每次 AI 交互（评估、教练、探索）都从零开始，系统没有对用户的持续理解。

求职画像引擎的目标是：从这些离散数据中提取一个持续进化的用户画像，成为 V2.0 Agent 的记忆基础。

## Goals / Non-Goals

**Goals:**
- 定义求职画像数据模型（技能向量、偏好向量、竞争力分数、进化历史）
- 构建数据挖掘管线——从 DexieDB + localStorage 提取特征
- 通过 DeepSeek API 推理生成画像（结构化 JSON 输出）
- 画像在每次新数据写入后自动增量更新
- 前端可视化页面展示画像

**Non-Goals:**
- 不做实时推送通知
- 不做向量数据库（V2.0 阶段数据量小，内存计算即可）
- 不做多用户/云端同步
- 不接入外部市场数据（那是 2.0.3 公司情报的事）

## Decisions

### 数据模型设计

```typescript
interface CareerProfile {
  skills: { name: string; proficiency: number; evidence: string[] }[];
  preferences: {
    companySize: { startup: number; sme: number; large: number };
    industry: Record<string, number>;       // e.g. { "AI": 0.8, "电商": 0.3 }
    workStyle: Record<string, number>;      // e.g. { "fast_paced": 0.9, "structured": 0.2 }
    salaryTarget: { min: number; max: number };
  };
  marketFit: {
    overallScore: number;                   // 0-100
    topArchetypes: string[];                // e.g. ["AI产品经理", "增长产品经理"]
    skillGaps: { skill: string; demand: number; myLevel: number; gap: number }[];
  };
  history: {
    timestamp: string;
    event: string;                          // e.g. "evaluated JD for 字节跳动"
    changes: string[];                      // human-readable change descriptions
  }[];
  lastUpdated: string;
}
```

**决策**: 使用单一 JSON 对象而非关系表。理由：(1) 画像数据量小（<100KB），(2) 每次更新是全量替换，(3) 版本历史用 embedded array 足够。

### 推理策略

| 数据源 | 提取方式 |
|--------|---------|
| Applications + Reports | 统计置信（score 分布、通过率、行业偏好） |
| PracticeRecords | LLM 推理——从回答中提取技能和弱项 |
| STAR Stories | LLM 推理——提取可迁移技能和成就 |
| CV | LLM 推理——技能提取 + 水平评估 |
| Explore Chat | LLM 推理——偏好信号提取 |

**决策**: 混合策略——结构化数据用统计（快速、确定性），非结构化数据用 LLM 推理（深度理解）。LLM 调用采用批量模式（所有文本一次性发送，一次推理完成）。

### API 设计

`POST /api/profile/analyze` 
- 入参: `{ force?: boolean }`（force 跳过缓存，强制全量重算）
- 返回: 完整 CareerProfile JSON（流式可选，画像结构固定且小，非流式也够快）
- 缓存: 上次分析时间 + 数据变更标记，增量更新

**决策**: 非流式 API。画像结构固定、体积小（~10KB JSON），不需要 SSE 的开销。与 evaluate/coach 的流式场景不同。

### 前端架构

- 新增 `/profile` 页面
- 组件: ProfileRadar（雷达图 SVG）、SkillGapList、PreferenceBars、EvolutionTimeline
- 导航更新: Shell 增加"求职画像"入口
- 雷达图用纯 SVG 实现（不引入图表库依赖）

## Risks / Trade-offs

- [画像质量依赖数据量] → 新用户只有 CV 时画像较空，UI 需处理空状态（"完成 3 次评估后画像将更准确"）
- [LLM 推理成本] → 增量更新策略：只在有新数据时触发，非每次页面访问
- [隐私] → 所有数据在客户端处理，API 仅发送脱敏摘要给 LLM（不传原始 JD/聊天全文）
