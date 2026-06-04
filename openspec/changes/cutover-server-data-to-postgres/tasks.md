## 1. Repository Boundary

- [x] 1.1 Define repository interfaces for users, CV data, reports, JDs, offers, sessions, and profile signals.
- [x] 1.2 Implement SQLite repositories by wrapping existing functions.
- [x] 1.3 Implement PostgreSQL repositories with matching response shapes.
- [x] 1.4 Add driver selection and fail-fast startup checks.

## 2. API Cutover

- [x] 2.1 Convert auth/admin/user APIs to repository access.
- [x] 2.2 Convert CV data and reference resume APIs.
- [x] 2.3 Convert JD/report/application APIs.
- [x] 2.4 Convert offer and offer report APIs.
- [x] 2.5 Convert session and agent context APIs.
- [x] 2.6 Convert profile signal APIs.

## 3. Client Storage Cleanup

- [x] 3.1 Identify Dexie/localStorage paths that still act as fact sources.
- [x] 3.2 Change authenticated pages to prefer server data and treat local data as cache/draft.
- [x] 3.3 Add visible error states when server data cannot be loaded.
- [x] 3.4 Remove silent fallback that can hide PostgreSQL read/write failures.

## 4. Regression Coverage

- [x] 4.1 Run auth and admin approval tests under PostgreSQL.
- [x] 4.2 Run data isolation tests under PostgreSQL.
- [x] 4.3 Run JD evaluation/report persistence tests under PostgreSQL.
- [x] 4.4 Run CV import/save tests under PostgreSQL.
- [x] 4.5 Run offer report persistence tests under PostgreSQL.
- [x] 4.6 Validate this OpenSpec change.
