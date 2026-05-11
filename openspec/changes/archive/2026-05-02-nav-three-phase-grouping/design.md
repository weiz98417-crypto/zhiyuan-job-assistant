## Context

The current `NavItem` layout in `AppShell.tsx` maps a flat `NAV_ITEMS` array directly into nav links with no grouping. The change is purely presentational — reorder items and insert phase labels between groups. No new components, no API changes, no data model changes.

## Goals / Non-Goals

**Goals:**
- Reorder `NAV_ITEMS` array to match the three-phase funnel
- Render phase section headers (non-interactive text labels) between groups
- Add thin horizontal dividers (`<hr>` or border) above each phase header
- Keep 首页 pinned at top, 设置 at bottom
- Reflect new order in mobile bottom tab bar (first 5 items)

**Non-Goals:**
- No sub-pages, nested menus, or collapsible groups
- No routing changes — all paths stay the same
- No changes to `NavItem` component itself
- No animation or transition changes

## Decisions

### Reorder NAV_ITEMS array in-place
Simply reorder the existing objects in the NAV_ITEMS array. Each item keeps its exact `href`, `label`, and `icon`. No new fields needed.

### Phase labels as inline elements in the JSX map
Rather than creating a new component or data structure, insert phase labels into the render by checking item position: render a divider + label before the first item of each group. This keeps the change minimal — no new files.

Alternative considered: restructure NAV_ITEMS as nested groups with a `SectionHeader` component. Rejected as over-engineering for 3 flat groups with 2-3 items each.

### Mobile: simple slice change
Mobile tab bar uses `NAV_ITEMS.slice(0, 5)` which will automatically pick up the new order. The 5 visible items become: 首页, 职位发现, JD评估, 简历优化, 投递追踪. This covers Phase 1 + the first item of Phase 2 — a reasonable mobile selection.

## Risks / Trade-offs

- [Mobile users lose direct access to 面试准备 from tab bar] → Users can still access via sidebar (desktop) or by scrolling the tab bar. This is consistent with the original design which also only showed 5 items.
- [Phase labels add slight visual height to sidebar] → Acceptable; 3 extra text lines in a ~9-item sidebar is negligible.

## Open Questions

<!-- None — straightforward change -->
