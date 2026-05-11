## 1. Data Layer

- [x] 1.1 Add `JDRecord` type to `frontend/src/types/index.ts`
- [x] 1.2 Add `jds` table to Dexie.js schema (v2 migration) in `frontend/src/lib/db.ts`
- [x] 1.3 Create `frontend/src/lib/jd-storage.ts` with CRUD functions (createJD, updateJD, deleteJD, getJDById, getAllJDs, searchJDs)

## 2. JD Library UI Page

- [x] 2.1 Create `/evaluate/jds` page route (`frontend/src/app/evaluate/jds/page.tsx`) with card grid layout
- [x] 2.2 Implement JD detail panel (view full body, edit fields, delete with confirmation)
- [x] 2.3 Implement search bar (filter by company, role, body) with real-time results
- [x] 2.4 Implement filter chips (sourceType, hasReport/noReport)
- [x] 2.5 Add empty state (warm illustration + CTA to evaluate page)
- [x] 2.6 Add sub-navigation tabs to /evaluate layout (评估 / JD 库)

## 3. Integration with Evaluate Page

- [x] 3.1 Add "保存到 JD 库" button to evaluation report action area
- [x] 3.2 Implement save-to-library logic: create JD record with reportId association
- [x] 3.3 Implement duplicate detection: if body first 200 chars match existing, update instead of create
- [x] 3.4 Handle saved state UI: button becomes "已保存到 JD 库" after success

## 4. Polish

- [x] 4.1 Add card entry animations (StaggerList / motion.div)
- [x] 4.2 Add source type icons (Clipboard for paste, Image for OCR, Link for URL)
- [x] 4.3 Handle long JD body truncation in card preview
