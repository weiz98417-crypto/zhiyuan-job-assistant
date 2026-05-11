## ADDED Requirements

### Requirement: Navigation items grouped by job search phases
The sidebar navigation SHALL organize items into three labeled phase groups separated by thin horizontal dividers, reflecting the natural job search funnel order.

#### Scenario: User sees phase-grouped navigation
- **WHEN** user opens the app on desktop
- **THEN** the sidebar displays:
  - 首页 at the top (outside any group, always first)
  - A "准备 · Prepare" section header followed by 职位发现, JD 评估, 简历优化
  - A thin horizontal divider
  - An "行动 · Act" section header followed by 投递追踪, 面试准备
  - A thin horizontal divider
  - A "收尾 · Close" section header followed by Offer 对比, 数据分析
  - 个人设置 at the bottom (outside any group, always last)

#### Scenario: Mobile tab bar reflects new order
- **WHEN** user opens the app on mobile
- **THEN** the bottom tab bar shows the first 5 items in the new order: 首页, 职位发现, JD 评估, 简历优化, 投递追踪

### Requirement: Phase labels match sidebar typography
Phase section header labels SHALL use the same muted typography style as the existing sidebar, visually distinct from navigation items but not distracting.

#### Scenario: Phase labels are visually muted
- **WHEN** user views the sidebar
- **THEN** phase labels (`准备 · Prepare`, `行动 · Act`, `收尾 · Close`) render in the muted color (`--color-muted`) at a smaller font size than nav items, non-interactive
