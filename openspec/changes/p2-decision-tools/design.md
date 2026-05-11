## Context

决策层工具（对比 offer、画像洞察、技能缺口）依赖已建好的数据资产和分层记忆系统。与 P0A/P0B 工具同模式：浏览器端 handler → API/fetch → 服务端计算 → 格式化输出。

## Goals / Non-Goals

**Goals:**
- Agent 能对比多个 offer 并给出数据驱动的推荐
- Agent 能从 63 条画像信号中提炼行为模式洞察
- Agent 能识别用户技能与目标 JD 要求的差距

**Non-Goals:**
- 不实现实时 offer 数据采集（用户手动输入或从已有评估记录提取）
- 不修改 RadarChart 组件或前端对比 UI（这些已有，Agent 工具输出数据供现有 UI 消费）

## Decisions

### D1: compare_offers_deep → 数据来源优先级

1. 用户消息中直接提到的 offer 数据
2. SQLite `applications` 表中已评估且 score ≥ 4 的记录
3. 用户手动输入

**Why:** 最大化利用已有数据，减少用户手动输入。但用户始终可以覆盖。

### D2: get_profile_insights → 读语义记忆 + profile_signals 双源

`get_profile_insights` 不重复造数据提取逻辑。它从两个已有源读数据：
- SQLite `session_memory`（semantic 类型）→ 对话中学到的偏好
- SQLite `profile_signals` → 63 条系统提取的信号
然后将两者拼接为结构化洞察文本。

**Why:** 语义记忆和 profile_signals 互补——signals 是正则 + LLM 在对话中实时提取，semantic 是会话结束时批量提取。双源覆盖更全。

### D3: detect_skill_gaps → CV + JD 对比

`detect_skill_gaps` 从 localStorage 或 API 读取 CV 文本，用 LLM 提取技能关键词，与 JD 的词频对比。

**Why:** 简单的词频对比即可产出实用结果。不需要训练模型或接入外部 API。

## Risks / Trade-offs

- **[Risk] compare_offers_deep 输出数据量大** → LLM 按维度分组展示，避免一次输出全部 6 维
- **[Trade-off] detect_skill_gaps 依赖 CV 内容质量** → 如果 CV 未填写完整，工具提示"CV 信息不完整，建议先完善简历"
