## 1. Report List Page

- [x] 1.1 Create `/evaluate/reports` page route with card grid layout
- [x] 1.2 Implement report card component (company, role, score badge, date, archetype tag)
- [x] 1.3 Add empty state (warm illustration + CTA to evaluate)
- [x] 1.4 Add card entry animations (StaggerList)

## 2. Report Detail Panel

- [x] 2.1 Create report detail sheet/drawer component (slide from right, fullscreen on mobile)
- [x] 2.2 Extract shareable A-G block rendering component from evaluate page
- [x] 2.3 Implement delete report with confirmation dialog and cascade cleanup

## 3. Search, Filter, and Sort

- [x] 3.1 Implement search bar (company, role, keywords)
- [x] 3.2 Implement score range filter (e.g., 3+, 4+, 4.5+)
- [x] 3.3 Implement time range filter (last 7 days, 30 days, all)
- [x] 3.4 Implement sort toggle (by date, by score)
- [x] 3.5 Add filter clear button

## 4. JD-Report Association

- [x] 4.1 Show "查看 JD" link on report cards when associated JD exists
- [x] 4.2 Show "查看报告" link in JD detail panel when reportId is set
- [x] 4.3 Implement cascade cleanup: unset jd.reportId when report is deleted

## 5. Sub-navigation

- [x] 5.1 Add sub-navigation tabs to /evaluate layout (评估 / JD 库 / 报告)
