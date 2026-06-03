## 1. Repository Boundary

- [ ] 1.1 Define repository interfaces for users, CV data, reports, JDs, offers, sessions, and profile signals.
- [ ] 1.2 Implement SQLite repositories by wrapping existing functions.
- [ ] 1.3 Implement PostgreSQL repositories with matching response shapes.
- [ ] 1.4 Add driver selection and fail-fast startup checks.

## 2. API Cutover

- [ ] 2.1 Convert auth/admin/user APIs to repository access.
- [ ] 2.2 Convert CV data and reference resume APIs.
- [ ] 2.3 Convert JD/report/application APIs.
- [ ] 2.4 Convert offer and offer report APIs.
- [ ] 2.5 Convert session and agent context APIs.
- [ ] 2.6 Convert profile signal APIs.

## 3. Client Storage Cleanup

- [ ] 3.1 Identify Dexie/localStorage paths that still act as fact sources.
- [ ] 3.2 Change authenticated pages to prefer server data and treat local data as cache/draft.
- [ ] 3.3 Add visible error states when server data cannot be loaded.
- [ ] 3.4 Remove silent fallback that can hide PostgreSQL read/write failures.

## 4. Regression Coverage

- [ ] 4.1 Run auth and admin approval tests under PostgreSQL.
- [ ] 4.2 Run data isolation tests under PostgreSQL.
- [ ] 4.3 Run JD evaluation/report persistence tests under PostgreSQL.
- [ ] 4.4 Run CV import/save tests under PostgreSQL.
- [ ] 4.5 Run offer report persistence tests under PostgreSQL.
- [ ] 4.6 Validate this OpenSpec change.
