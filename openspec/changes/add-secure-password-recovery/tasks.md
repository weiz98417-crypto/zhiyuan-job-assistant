# Tasks

- [x] 1.1 Add SQLite and PostgreSQL recovery-request schema and repository contracts.
- [x] 1.2 Add public request throttling and generic-response API tests.
- [x] 1.3 Implement the public recovery request API and durable audit write.
- [x] 2.1 Add superadmin-only pending request projection to user management.
- [x] 2.2 Resolve a linked request atomically through the existing temporary-password reset.
- [x] 3.1 Add `/forgot-password` and the login-page entry.
- [x] 3.2 Add the personal-settings password-change entry.
- [x] 4.1 Run focused authentication tests, full test suite, lint, and production build.
- [x] 4.2 Deploy behind the existing `121.43.198.13:38084` Nginx entry and verify the workflow.

## Verification notes

- Authentication-focused regression: 57 tests passed across 9 files.
- Repository and public recovery tests: 16 tests passed across 2 files after ambiguous-email hardening.
- `npx tsc --noEmit`: passed.
- `next build`: passed and emitted both `/forgot-password` and `/api/auth/password/recovery-request`.
- Changed-file ESLint: 0 errors; existing Hook warnings remain in pre-existing page code.
- Full-suite baseline remains red for unrelated pre-existing issues: a missing job-discovery OpenSpec file, an invalid JD test file, agent tool-risk audit drift, and a missing SQLite archive fixture.
- Full-repository ESLint remains red with 31 pre-existing errors outside this change.
- 2026-08-08: Deployed feature commit `7ddc8e0`, then deployed visual-QA fix `eef7c0f` as the final release `20260808-password-pages-eef7c0f` behind the existing `121.43.198.13:38084 -> 127.0.0.1:3100` Nginx route. The pre-migration PostgreSQL dump was validated with `pg_restore -l` and SHA-256 before the additive schema was applied to the dedicated `zhiyuan-job-assistant-postgres` container.
- Production read-back confirmed the recovery table, its pending-request indexes, the `/forgot-password` page, the generic `202 RECOVERY_REQUEST_ACCEPTED` response, and zero writes for an unknown account.
- A disposable production member completed the full flow: activation, initial login, recovery request projection to superadmin, step-up authentication, atomic temporary-password reset, pending-request completion, old-token rejection, forced `/change-password` redirect, password replacement, and normal login. The disposable account was deleted after verification.
- Desktop and mobile Chrome QA confirmed that password recovery renders outside `AppShell`, exposes the complete form without navigation overlap or horizontal overflow, and produces no browser console errors.
