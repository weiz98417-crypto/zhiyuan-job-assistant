## Why

The current sidebar navigation lists 9 items in a flat, non-semantic order that doesn't match a real job seeker's workflow. 职位发现 (discovery) sits at the bottom while Offer对比 (comparison) appears before 简历优化 (CV) and 面试准备 (interview prep) — users encounter comparison before they've applied anywhere. Reorganizing into three logical phases guides the user through their job search journey in the natural order: prepare → act → close.

## What Changes

- Reorder `NAV_ITEMS` in `AppShell.tsx` into three phase groups with visual dividers:
  - **Phase 1 (准备 · Prepare)**: 职位发现 → JD 评估 → 简历优化
  - **Phase 2 (行动 · Act)**: 投递追踪 → 面试准备
  - **Phase 3 (收尾 · Close)**: Offer 对比 → 数据分析
- 首页 stays pinned at top as the daily dashboard entry point
- 个人设置 stays pinned at bottom as a utility
- Add thin section headers (text labels) between phase groups, matching the sidebar's muted typography style
- Mobile bottom tab bar: keep the first 5 items but reflect the new order (首页, 职位发现, JD评估, 简历优化, 投递追踪)

## Capabilities

### New Capabilities

- `nav-three-phase-grouping`: Sidebar navigation organized into three labeled phase groups with visual separators, reflecting the job search funnel order (prepare → act → close).

### Modified Capabilities

<!-- None — existing specs unchanged -->

## Impact

- `frontend/src/components/shell/AppShell.tsx`: reorder `NAV_ITEMS` array, add phase label elements between groups in the JSX render
- Mobile tab bar: order change (no structural change)
- No API, data model, or dependency changes
