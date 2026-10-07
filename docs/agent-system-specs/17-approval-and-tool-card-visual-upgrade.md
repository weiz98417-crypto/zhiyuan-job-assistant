# Spec 17: Approval And Tool Card Visual Upgrade

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0016、ADR-0037、Spec 04 的 Conversation Item 投影、「安全工具视图」词表；批次归属 0.13.1（B1）

## Problem Statement

RunGateCard 已有三态逻辑渲染（`AgentDomainCards.tsx:318-367`：pending 带批准/拒绝按钮、approved「已批准，正在继续」、denied「已拒绝」），但视觉层次单薄；工具调用、任务进度、推理摘要卡为手搓实现，样式逻辑散落在事件方言映射（dialect data-part）中。审批与工具执行过程的呈现缺乏统一来源，每加一种卡片都要重写一遍样式。真实缺口是视觉与组件归一，不是功能。

## Solution

抄录 Vercel AI Elements（Apache-2.0，shadcn registry 分发即源码复制）的 Tool / Task / Reasoning / InlineCitation 组件进仓库并改纸鸢 paper 风格；RunGateCard 升级为 pending / approved / denied 三态展示；不改审批 API、不改事件方言、不改投影协议。

## User Stories

1. 作为求职者，我希望审批卡清楚显示"等待我批准 / 已批准 / 已拒绝"与具体动作内容，从而知道批的到底是什么。
2. 作为求职者，我希望工具执行过程有稳定的进度与结果呈现，而不是临时样式闪烁。
3. 作为求职者，我希望报告与建议带出处引用，从而能核对来源。
4. 作为实现 Agent，我希望组件源码进仓库、零新增运行时依赖，从而视觉统一由我们掌控。

## Implementation Decisions

- AI Elements 组件按 registry 方式复制进 `src/components/`，改造为纸鸢 paper 令牌；不安装其 npm 运行时包（分发形态即源码）。注意其组件绑定 Vercel AI SDK v5（`ai` 包）的类型与数据部件，而仓库无 `ai` 依赖——复制后重接 Conversation Item 数据源，不引入 `ai` 包；若类型依赖不可避免，先回评审决定。
- 三态仅为展示：pending / approved / denied 读取既有 Run Gate 状态；不新增决策类型，改参重交明确排除（2026-10 计划决策 #7）。
- 卡片渲染只消费 Conversation Item / 安全工具视图投影，不得直接读取 Run Event payload。
- Reasoning 卡只呈现「推理摘要」词表允许的内容：不出现系统提示词、Skill 正文或模型原始推理。
- InlineCitation 用于报告/建议类卡片的出处标注，数据来自既有引用字段，不新增引用来源。

## Testing Decisions

- 组件渲染单测：审批三态、任务进度、推理折叠、引用标注。
- 既有方言映射与投影测试全绿（只改渲染层，协议与数据不动）。
- 批 B 验收时按纸鸢设计样张做视觉验收。

## Out of Scope

- 审批 API 改动与改参重交；新增卡片类型。
- 移动端专项适配；引入 AI Elements 之外的组件体系。

## Further Notes

- 本 spec 是纯渲染层升级：若发现需要动投影或方言才能实现视觉，说明需求越界，先回评审。
- ADR-0037 预告 assistant-ui 的 ApprovalCard 未来可能替换 gate 卡：实现保持卡片为 assistant-ui 兼容的工具 UI 形态，降低未来替换成本。
