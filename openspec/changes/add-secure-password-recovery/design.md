# Design: secure password recovery

## Recovery model

The first production-safe recovery path is support mediated:

1. A user submits a username or email on `/forgot-password`.
2. The public endpoint returns a generic accepted response for both known and unknown accounts.
3. For an active known account, the server creates or refreshes one pending recovery request and records a secret-free audit event.
4. A superadmin sees the request in user management, verifies identity out of band, performs step-up authentication, and generates the existing one-time temporary password.
5. Password replacement, session revocation, request completion, and the reset audit event commit atomically.
6. The user logs in with the temporary password and is forced to choose a policy-compliant permanent password.

## Data model

`password_recovery_requests` stores `id`, `user_id`, `status`, request timestamps, resolver identity, resolution, trusted source IP, and user agent. It never stores the public account identifier, a password, a reset token, or a temporary password. A partial unique index permits only one pending request per user.

## Abuse and enumeration controls

- The public response is identical for known and unknown accounts.
- Account and source-IP rate-limit keys are HMAC digests in the dedicated security Redis instance.
- Production fails closed when the limiter is unavailable.
- The request endpoint validates the configured application origin.
- Pending requests are visible only to `superadmin`.

## TDD slices

1. Public recovery requests return the same response for known and unknown accounts and persist only known active users.
2. Request throttling limits account/IP abuse and fails closed in production.
3. User management exposes pending requests only to superadmins.
4. Administrative reset resolves the matching request in the same transaction as password replacement and audit insertion.
5. Login and settings expose the intended recovery and password-change entries.
