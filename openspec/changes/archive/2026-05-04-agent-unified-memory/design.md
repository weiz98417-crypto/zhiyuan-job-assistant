## Context

V2.0 的三个 change（career-profile-engine, agent-smart-recommend, agent-dashboard）搭建了推荐 + 仪表盘的基础设施，但 Agent 本质上缺少闭环能力。当前状态：

- **Memory**: CareerProfile 存了画像，但 Agent 不记录自己的决策，不学习用户反馈。"不感兴趣"只是前端淡出
- **Tools**: 15 个 API 路由独立存在（evaluate, interview, cv, health-check 等），Agent 不会调用，只能通过 LLM 生成文案
- **Knowledge**: LLM system prompt 里几句硬编码描述，没有结构化的行业知识
- **探索断裂**: `/explore` 页面聊天总结的画像存在 localStorage，Agent 的 CareerProfile 在 DexieDB，两套数据互不相通

设计约束：(1) 本地优先，无服务端 Agent 进程，(2) 所有 Memory 存 DexieDB，(3) LLM 调用走 DeepSeek API，(4) Agent 推理在浏览器端按需触发。

## Goals / Non-Goals

**Goals:**
- 建立三层 Agent Memory 模型（交互记忆 / 决策记忆 / 偏好模型），DexieDB 持久化
- 建立 Tool Registry，将现有 API 封装为 Agent 可调用的工具
- 建立结构化 Knowledge Base，按场景注入 LLM context
- 打通探索 → 画像链路：summarize 结果同步写入 CareerProfile + PreferenceModel
- 推荐反馈闭环：dismiss/accept 推荐 → 更新偏好模型 → 影响后续推荐
- 统一 System Prompt 分层，保持纸鸢人格一致性

**Non-Goals:**
- 不做 Agent 对话页（留给下一个 change：agent-conversational）
- 不做实时 Agent 进程（浏览器端按需触发）
- 不做向量数据库 / RAG（数据量小，结构化查询足够）
- 不做 WebSocket 推送
- 不引入新的外部依赖（只用 DexieDB + DeepSeek API）

## Decisions

### 1. Memory 三层模型

```
┌─────────────────────────────────────────┐
│ Layer 1: AgentInteraction (交互记忆)     │
│                                         │
│ 每次 Agent 触发 → 完整记录：             │
│ · contextSnapshot (当时的画像/管道快照)   │
│ · reasoning (Agent 思考了什么)           │
│ · toolsUsed (调用了哪些工具)             │
│ · output (展示了什么给用户)              │
│ · feedback (用户怎么回应 — 事后填充)     │
│                                         │
│ 用途: 上下文追溯，避免重复推荐            │
├─────────────────────────────────────────┤
│ Layer 2: AgentDecision (决策记忆)        │
│                                         │
│ 每个具体的推荐/警告/建议 → 追踪结果：     │
│ · type + content (推荐了什么)            │
│ · confidence (Agent 自己有多确定)       │
│ · userResponse (用户接受/拒绝/忽略)      │
│ · outcome (后续结果 — 投了？面了？offer？)│
│                                         │
│ 用途: 评估 Agent 决策质量，训练偏好       │
├─────────────────────────────────────────┤
│ Layer 3: AgentPreferenceModel (偏好模型) │
│                                         │
│ 从反馈中持续学习 → 影响推荐排序：         │
│ · rolePreferences (喜欢/讨厌的角色类型)  │
│ · companyPreferences (喜欢/讨厌的公司)   │
│ · salarySensitivity (薪资敏感度)         │
│ · behaviorPatterns (决策风格)            │
│                                         │
│ 用途: 推荐排序的偏好加成权重              │
└─────────────────────────────────────────┘
```

**为什么三层而不是一张表？** 交互记忆是时序日志（高频写入，冷数据），决策记忆是实体追踪（需要关联 application/report ID 做结果回填），偏好模型是聚合计算（低频更新，高频读取）。三张表各司其职，查询模式不同。

### 2. Tool Registry 设计

采用 **声明式注册 + 客户端调用** 模式（非 OpenAI function calling，因为本地优先不需要服务端 Agent 进程）：

```typescript
// 工具定义 schema
interface AgentTool {
  name: string;
  description: string;          // LLM 用：这个工具干什么
  parameters: Record<string, {   // LLM 用：参数说明
    type: "string" | "number" | "boolean" | "object";
    required: boolean;
    description: string;
  }>;
  // 执行器：客户端直接调用
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  // 结果格式化：把返回值转成 LLM 可读的文本
  formatResult: (result: unknown) => string;
}
```

工具分为两类：
- **查询工具**（读 DexieDB）：search_applications, get_report_detail, get_profile
- **行动工具**（调 API）：evaluate_jd, check_health, recommend, generate_interview, tailor_cv

**为什么不用 OpenAI function calling 格式？** 当前 Agent 推理就在 DeepSeek prompt 里做——把工具列表序列化为 prompt 文本，让 LLM 决定调用哪个，然后客户端执行。省去 function calling 的 schema 对齐成本，而且 DeepSeek v4-flash 对文本格式的工具描述支持良好。

### 3. Knowledge Base 注入策略

知识分为两层：

| 层级 | 内容 | 注入时机 | 注入方式 |
|------|------|---------|---------|
| 静态知识 | 行业职级、薪资基准、公司画像、JD 信号词典 | Agent 启动时 | 嵌入 system prompt（~2000 tokens） |
| 动态知识 | 用户画像、Pipeline 快照、最近活动、偏好模型 | 每次推理前 | 查询 DexieDB 组装（~1000 tokens） |

静态知识存储在 `frontend/src/lib/agent/knowledge/` 下的 TypeScript 文件中，按场景选择性注入（不需要每次都把所有知识塞进去）。

### 4. 探索 → 画像链路打通

当前链路:
```
/explore 聊天 → 点"总结" → POST /api/chat/summarize → 返回结构化画像 → 存 localStorage
```

改造后链路:
```
/explore 聊天 → 点"总结" → POST /api/chat/summarize → 返回结构化画像
                                                      ├→ 存 localStorage (兼容)
                                                      ├→ 写入 CareerProfile.goals
                                                      └→ 写入 AgentPreferenceModel.rolePreferences
```

`/api/chat/summarize` 的返回结果已有 targetRoles、preferences、constraints。只需在 explore 页面总结成功后额外调用：
1. `saveProfile()` 更新 goals 字段
2. 写入 AgentPreferenceModel 的初始偏好

### 5. 推荐反馈闭环

```
用户点"不感兴趣"
    │
    ▼
前端: 卡片淡出 (现有逻辑)
    │
    ▼
NEW: 写入 AgentInteraction.feedback = "dismissed"
    │
    ▼
NEW: 更新 AgentPreferenceModel
    · rolePreferences[被拒role] -= 0.1
    · companyPreferences.disliked += 被拒公司
    │
    ▼
下次推荐: computeMatchScore 叠加偏好权重
    · 偏好加成: +5 分 for liked roles/companies
    · 偏好惩罚: -10 分 for disliked roles/companies
```

### 6. System Prompt 分层架构

```
┌─────────────────────────────────────┐
│  Base Persona: 纸鸢 (~500 tokens)   │  ← 不变的核心人格
│  "一个朋友。轻的。不催促。"          │
├─────────────────────────────────────┤
│  Mode Overlay (~500 tokens)         │  ← 按场景切换
│                                     │
│  探索模式: "BASE/DEEP 聊天框架"      │
│  执行模式: "分析 + 推荐 + 行动导向"  │
├─────────────────────────────────────┤
│  Knowledge Injection (~1500 tokens) │  ← 按场景选择
│                                     │
│  行业知识 / 薪资基准 / 公司画像      │
│  + 用户画像 / Pipeline 快照          │
├─────────────────────────────────────┤
│  Tool Descriptions (~500 tokens)    │  ← 仅执行模式
│                                     │
│  可用工具列表 + 参数说明             │
└─────────────────────────────────────┘
```

## Risks / Trade-offs

- [DexieDB 表膨胀] AgentInteraction 高频写入，长期可能积累大量日志 → 保留最近 90 天，自动清理旧记录
- [偏好模型过拟合] 用户早期 dismiss 的几个推荐可能导致过度惩罚某类岗位 → 偏好权重限制在 ±15 分以内，confidence < 0.3 时不生效
- [LLM context 膨胀] Knowledge 注入增加 token 消耗 → 按场景选择性注入，全量知识仅在首次加载时组装，后续缓存
- [探索→画像写入冲突] 用户可能同时有手动设定的 goals 和探索总结的偏好 → 探索总结的偏好标记 source="explore"，手动设定的标记 source="manual"，后者优先级更高

## Migration Plan

1. DexieDB v5 migration: 新增 agentInteractions, agentDecisions, agentPreferences 三张表
2. 存量数据：已有 CareerProfile.goals 迁移为初始 AgentPreferenceModel 的种子数据
3. 无需数据迁移：推荐引擎升级为向后兼容——无偏好模型时行为与 V2.0 一致
4. 回滚：DexieDB 降级到 v4，偏好加成置零即可

## Open Questions

- 偏好模型的衰减策略：用户 3 个月前 dismiss 的偏好是否应该随时间衰减？（暂定：90 天半衰期）
- Agent 推理频率：每次仪表盘加载都推理还是按事件触发？（暂定：仪表盘加载 + 关键事件触发，每天最多 5 次完整推理）
