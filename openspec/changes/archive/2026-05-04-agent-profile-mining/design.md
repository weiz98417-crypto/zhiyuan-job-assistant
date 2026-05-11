## Context

求职画像系统已具备 LLM 分析能力（profile-mining.ts + /api/profile/analyze），但画像更新只能手动触发。Agent Chat 迁入后画像挖掘流程失联。

调研了 GROW 模型、Designing Your Life Odyssey Plan、Ikigai、五阶段会话结构、AI Career Coach（theo-ai-lab）等多套框架后，确定核心设计原则：**不搞固定脚本，不搞多 Agent（暂缓），做一个知道"什么时候用什么问题"的引导者**。

## Goals / Non-Goals

**Goals:**
- 创建 `modes/zh/dingwei.md` — 独立 Skill 文件，被触发时加载
- Agent Chat 通过 SuggestionChip 触发 Skill
- 评估后自动更新画像
- `/profile` 退化为纯展示

**Non-Goals:**
- 不搞多 Agent 对抗探针（Vision 保留）
- 不改 profile-mining.ts 的分析逻辑

## Decisions

### Decision 1: Skill 文件 vs prompt 注入

Skill 作为独立的 `modes/zh/dingwei.md` 文件存在。Agent Chat 触发时加载，与 `jianzhi.md` 同级的规范。

**理由:** 可独立迭代、可测试、不和 prompt.ts 耦合。真 Skill 不是 prompt.ts 里塞一段话。

### Decision 2: 自适应对话 vs 固定脚本

技能核心是**对话原则 + 问题工具箱 + 节奏感知**，不是按顺序执行的问卷。

四个阶段（设定期望→判状态→深挖→收尾）提供节奏骨架。问题工具箱（深挖/追问/限幅信念重构/收尾）供 Agent 根据用户反应自由选用。核心规则："跟能量走，追问>新问题，用户自己总结"。

### Decision 3: 多 Agent 暂缓

Interviewer + Evaluator 双 Agent 对抗探针留作 Vision。当前用纯 prompt 驱动的自适应对话即可覆盖核心场景，过度设计反而降低可维护性。

### Vision: 多 Agent 对抗探针（未来迭代）

```
Interviewer Agent: 自适应驱动对话
Evaluator Agent: 后台实时评分，模糊回答触发深度追问
Knowledge RAG: 胜任力模型(BARS) + 行业薪资 + 岗位能力图谱
实验闭环: Agent 给用户布置"市场验证任务"
```
