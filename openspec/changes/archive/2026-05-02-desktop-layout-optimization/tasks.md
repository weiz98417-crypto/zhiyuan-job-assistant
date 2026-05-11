## 1. Global Content Width

- [x] 1.1 AppShell: change main content area `max-w-4xl` → `max-w-6xl` (1152px)
- [x] 1.2 Verify all pages inherit wider content area without breaking

## 2. Evaluate Page — Input View

- [x] 2.1 Remove `max-w-2xl` wrapper from input view, let it use AppShell width
- [x] 2.2 Increase textarea rows from 14 to 18, set min-width to ensure comfortable editing on wide screens
- [x] 2.3 Adjust input mode tabs and language toggle layout for wider context (no overflow)

## 3. Evaluate Page — Report View

- [x] 3.1 Remove `max-w-3xl` wrapper from report view
- [x] 3.2 Implement `xl:flex-row` dual-column layout for report (A-G blocks left 55%, deep analysis sidebar right 45%)
- [x] 3.3 Extract deep analysis panel (keyword coverage, skill gaps, differentiation tips) into a sticky sidebar on XL screens
- [x] 3.4 When no deep analysis data exists, sidebar hides and report stays single column
- [x] 3.5 Action buttons (add to tracker, optimize CV, etc.) remain in header area, adapt to wider width

## 4. CV Page — XL Grid Upgrade

- [x] 4.1 Change grid from `lg:grid-cols-3` to `lg:grid-cols-3 xl:grid-cols-[1fr_360px]`
- [x] 4.2 Ensure JD matching panel stays visible and sticky on XL screens
- [x] 4.3 Editor textareas expand to fill wider main column

## 5. JD Library — Card Grid Responsive

- [x] 5.1 Add `xl:grid-cols-3` to card grid (currently stops at `md:grid-cols-2`)
- [x] 5.2 Verify card content (company, role, body preview, badges) looks correct in 3-column layout

## 6. Reports Page — Card Grid + Detail Panel

- [x] 6.1 Add `xl:grid-cols-3` to report card grid
- [x] 6.2 Increase detail slide-out panel width to ~512px on XL screens (`max-w-lg`)
- [x] 6.3 Verify ScoreBadge, search bar, filter chips layout adapts to wider context

## 7. Final Verification

- [x] 7.1 Test all pages at 1024px, 1280px, 1440px, 1920px, 2560px widths (Playwright verified)
- [x] 7.2 Ensure no horizontal scrollbar appears at any breakpoint (verified — zero scrollbars)
- [x] 7.3 Verify text readability — textareas and editors have comfortable widths at all breakpoints
- [x] 7.4 Verify animations (Framer Motion transitions) still work correctly with new layouts (AppShell page transition unchanged)
