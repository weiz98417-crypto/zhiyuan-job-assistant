## Why

求职画像系统（profile-mining.ts + /api/profile/analyze）能基于投递数据进行 LLM 分析，但完全孤立于 Agent Chat。用户必须手动访问 `/profile` 页面点击按钮，Agent 对话中无法触发。原来设计的画像挖掘流程在 Agent Chat 迁移后失联。评估完成也不自动更新画像。

更根本的问题是：现有的 5 个固定问题 SOP 过于简单。真正的职业发现对话是网状发散的——用户说一句话可能引出三个新方向。需要的是一个知道"什么时候用什么问题、什么时候追问、什么时候收尾"的引导者，而不是一个按固定顺序念问题的问卷机器人。

## What Changes

- 新建 `modes/zh/dingwei.md` — 自我定位 Skill 文件。与 `jianzhi.md` 同级，被 Agent Chat 触发时加载。内容包含：核心对话原则（5 条）、四阶段对话节奏、问题工具箱（深挖/追问/限幅信念重构/收尾）、退出条件、反模式
- Agent Chat 通过 SuggestionChip「自我定位」触发 Skill — 点击后 Agent 加载 dingwei.md 进入引导角色
- 评估完成后自动触发画像更新 — eval 完成时静默调 `/api/profile/analyze`，EvolutionTimeline 自动记录
- `/profile` 降级为管理展示页 — 移除手动分析按钮，页面变为纯可视化仪表盘，引导用户通过 Agent Chat 触发
- GoalSettingWizard 融入 Agent 对话 — Agent 替代弹窗表单

## Capabilities

### New Capabilities

- `career-discovery-skill`: `modes/zh/dingwei.md` — 独立的自我定位 Skill 文件。包含自适应对话框架（原则+工具箱+节奏感知+退出条件），被 Agent Chat 触发时加载
- `profile-auto-evolve`: 评估完成后自动触发画像更新，EvolutionTimeline 自动记录

### Modified Capabilities

- `profile-settings-ui`: `/profile` 页面降级为纯管理展示

## Impact

- 新增：`modes/zh/dingwei.md`（Skill 文件）、`lib/agent/tools/action/mine-profile.ts`（画像挖掘工具）、`lib/agent/profile-sop.ts`（SOP 状态管理）
- 改造：`lib/agent/prompt.ts`（dingwei.md 触发逻辑）、`components/agent/SuggestionChips.tsx`（「自我定位」chip）、`app/agent/page.tsx`（评估后 auto-analyze）
- 简化：`app/profile/page.tsx`（移除手动分析按钮）
- Vision（不改）：多 Agent 对抗探针架构留待后续迭代
