# Tasks

- [x] 1.1 Add SQLite and PostgreSQL recovery-request schema and repository contracts.
- [x] 1.2 Add public request throttling and generic-response API tests.
- [x] 1.3 Implement the public recovery request API and durable audit write.
- [x] 2.1 Add superadmin-only pending request projection to user management.
- [x] 2.2 Resolve a linked request atomically through the existing temporary-password reset.
- [x] 3.1 Add `/forgot-password` and the login-page entry.
- [x] 3.2 Add the personal-settings password-change entry.
- [x] 4.1 Run focused authentication tests, full test suite, lint, and production build.
- [ ] 4.2 Deploy behind the existing `121.43.198.13:38084` Nginx entry and verify the workflow.

## Verification notes

- Authentication-focused regression: 57 tests passed across 9 files.
- Repository and public recovery tests: 16 tests passed across 2 files after ambiguous-email hardening.
- `npx tsc --noEmit`: passed.
- `next build`: passed and emitted both `/forgot-password` and `/api/auth/password/recovery-request`.
- Changed-file ESLint: 0 errors; existing Hook warnings remain in pre-existing page code.
- Full-suite baseline remains red for unrelated pre-existing issues: a missing job-discovery OpenSpec file, an invalid JD test file, agent tool-risk audit drift, and a missing SQLite archive fixture.
- Full-repository ESLint remains red with 31 pre-existing errors outside this change.
