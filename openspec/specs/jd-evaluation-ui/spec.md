## MODIFIED Requirements

### Requirement: JD 输入

JD 输入功能 SHALL 从 `/evaluate` 页面迁移到 Agent Chat（`/agent`）。用户通过 Agent 对话输入 JD 文本/URL/截图触发评估。`/evaluate` 页面不再包含输入区和评估功能。

#### Scenario: 评估入口变更

- **WHEN** 用户需要评估 JD
- **THEN** 主要入口为 `/agent` 页面的 Agent Chat
- **AND** `/evaluate` 页面不再提供 JD 输入区

## ADDED Requirements

### Requirement: JD 管理概览

`/evaluate` 首页 SHALL 作为 JD 管理的总览页面，展示库统计并提供到 JD 库和报告库的快捷入口。

#### Scenario: 概览页展示

- **WHEN** 用户访问 `/evaluate`
- **THEN** 页面 SHALL 展示 JD 库统计（总数、按来源分类）和报告库统计（总数、平均分）
- **AND** 提供「查看 JD 库」和「查看报告库」的快捷按钮
- **AND** 提供「去 Agent 评估」的快捷入口

#### Scenario: 空状态引导

- **WHEN** 用户尚未评估过任何 JD（无数据）
- **THEN** 页面 SHALL 显示引导：「还没有评估记录。前往 Agent Chat 开始第一次评估 →」

## REMOVED Requirements

### Requirement: 假加载动画步骤列表

**Reason**: 评估功能迁移到 Agent Chat 后，`/evaluate` 不再有 loading 状态。

**Migration**: 移除 `evaluate/page.tsx` 中的 `LOADING_STEPS` 常量、`setInterval` 逻辑、`handleSubmit` 评估逻辑、`InputMode` 状态和三个 Tab 切换按钮。

### Requirement: A-G 评估报告渲染

**Reason**: 评估报告的实时展示移到 Agent Chat 的评估卡片中。历史报告的详细查看通过 `/evaluate/reports` 页面。

**Migration**: 移除 `evaluate/page.tsx` 中的报告渲染逻辑（`ReportBlocks` 调用保留在 `/evaluate/reports` 中）。

### Requirement: Text/URL/OCR 三个独立 Tab 切换

**Reason**: 评估输入统一到 Agent Chat 的输入区（文本 + `+` 按钮）。`/evaluate` 不再需要输入区。

**Migration**: 移除 `InputMode` 状态变量和三个 Tab 按钮组件。
