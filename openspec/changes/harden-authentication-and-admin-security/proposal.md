# Change: harden-authentication-and-admin-security

## Why

The production administrator account stopped accepting the expected password. Investigation proved that the login verifier behaved correctly: an authenticated browser session had opened the user administration page, reset the administrator password, logged out, and logged in with the replacement password. The application currently records the resulting hash and token-version change but does not record who performed the reset, why it was performed, or whether the actor reauthenticated.

This creates an account-takeover path: anyone holding a stolen administrator cookie can replace an administrator password without knowing the current password. The current implementation also accepts weak passwords at the API boundary, uses process-local login rate limiting, trusts forwarded IP headers too broadly, has no super-administrator boundary, and has no durable authentication security ledger.

## What Changes

- Introduce `member`, `admin`, and `superadmin` authorization with centralized server-side role checks.
- Make self-service password changes require the current password.
- Require short-lived step-up authentication before privileged password resets and role changes.
- Prevent administrators from resetting themselves or other administrator accounts; only a superadmin may reset another administrator.
- Generate temporary passwords for administrative resets and require the target user to replace them at next login.
- Enforce server-side password policy and reject common or account-derived weak passwords.
- Add an append-only PostgreSQL authentication security event ledger and make privileged mutations atomic with their audit event.
- Replace process-local login throttling with a Redis-backed limiter keyed by both normalized account and trusted client IP.
- Validate request origin and CSRF tokens for cookie-authenticated state-changing requests.
- Add security alerts for administrator credential and role changes.
- Add production deployment controls for HTTPS, trusted proxy headers, dedicated Redis, key rotation, and SSH hardening.

## Non-Goals

- Do not add social login, SMS login, or passwordless authentication in this change.
- Do not store plaintext passwords, temporary passwords, JWTs, cookies, or secrets in audit records.
- Do not reuse Redis instances owned by Dify or unrelated services on the server.
- Do not introduce a general organization or tenant permission system.
- Do not rotate real production secrets through committed files; rotation remains an operator runbook action.

## User Impact

- Existing members continue to sign in with username and password.
- The current administrator is migrated to `superadmin` so that the deployment cannot lose all privileged access.
- A user changing their own password must provide the current password and will be signed out after success.
- An administrator resetting another user's password must reauthenticate, provide a reason, and share a one-time temporary password that forces a change at next login.
- Weak passwords such as `admin123` are rejected.
- Security-sensitive actions become visible in a superadmin-only audit view and can trigger an operator alert.

