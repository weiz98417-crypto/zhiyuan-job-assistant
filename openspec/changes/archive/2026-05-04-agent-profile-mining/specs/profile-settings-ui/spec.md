## MODIFIED Requirements

### Requirement: 画像分析触发

画像分析 SHALL 不再通过 `/profile` 页面手动按钮触发。分析触发 SHALL 迁移到 Agent Chat 侧（SOP 对话 + 评估后自动更新）。

#### Scenario: 移除手动分析按钮

- **WHEN** 用户访问 `/profile` 页面
- **THEN** 页面 SHALL 不再显示「手动分析」按钮
- **AND** SHALL 显示「画像由 Agent 对话和评估自动更新」说明
- **AND** SHALL 显示上次更新时间

#### Scenario: 数据展示保持不变

- **WHEN** 用户访问 `/profile` 页面
- **THEN** SkillRadar、SkillGapList、PreferenceBars、EvolutionTimeline SHALL 正常展示
- **AND** 数据来源为 IndexedDB 中的最新画像

## REMOVED Requirements

### Requirement: 手动分析按钮

**Reason**: 画像更新触发逻辑迁移到 Agent Chat（SOP 对话 + 评估后自动触发）。`/profile` 变为纯展示管理页。

**Migration**: 移除 `profile/page.tsx` 中的 `handleAnalyze` 函数、loading 状态、error 状态，以及「手动分析」按钮 UI。保留 `fetchProfile` 数据加载逻辑和所有可视化组件。
