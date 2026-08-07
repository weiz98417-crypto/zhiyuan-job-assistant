# Design: authentication and administrator security hardening

## Incident-derived threat model

The observed production sequence was a successful administrator login followed by a successful self-password-reset request and a second successful login with the replacement password. The password verifier was not at fault. The unsafe boundary was the ability of an authenticated administrator cookie to replace its own credential without proving knowledge of the current password, combined with the absence of durable audit evidence.

The change protects against:

- a stolen administrator cookie being converted into durable account ownership;
- weak or account-derived passwords being accepted by a direct API call;
- ordinary administrators changing administrator credentials or roles;
- brute-force controls disappearing after a process restart or being bypassed with spoofed forwarding headers;
- cross-site requests invoking cookie-authenticated mutations;
- privileged mutations becoming untraceable.

## Authorization model

Roles become `member | admin | superadmin`.

| Capability | member | admin | superadmin |
| --- | --- | --- | --- |
| Change own password with current password | yes | yes | yes |
| Approve or reject members | no | yes | yes |
| Reset member password after step-up | no | yes | yes |
| Reset admin password after step-up | no | no | yes |
| Change member/admin roles after step-up | no | no | yes |
| Inspect authentication security events | no | no | yes |

The server exposes centralized `requireAuthenticated`, `requireAdmin`, and `requireSuperadmin` guards. Middleware may reject obvious page access, but API guards and fresh `token_version` checks remain authoritative.

The system shall reject:

- any administrative reset targeting the actor;
- an admin reset targeting an admin or superadmin;
- deletion, rejection, or demotion of the last active superadmin;
- stale JWTs after password, status, or role changes.

## Password flows

### Self-service change

`POST /api/auth/password/change`

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

The route validates same-origin and CSRF evidence, verifies the current password, applies the password policy, updates the hash and `token_version`, records `password_change` in the same database transaction, and clears the authentication cookie. It does not preserve the current session.

### Step-up authentication

`POST /api/auth/step-up`

```json
{
  "password": "...",
  "purpose": "admin_password_reset"
}
```

Successful verification creates an opaque random token. Only its SHA-256 hash is stored in Redis under a user- and purpose-scoped key with a five-minute TTL. The raw token is returned in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Consumption is atomic and single-use. User id, token version, purpose, trusted IP, and a user-agent digest are bound to the record.

### Administrative reset

`POST /api/admin/users/:id/password-reset`

```json
{
  "reason": "User verified by support"
}
```

The route consumes a matching step-up token, validates actor and target roles, generates a cryptographically random temporary password, updates the target hash, sets `must_change_password=true`, increments `token_version`, and inserts `admin_password_reset` in one transaction. The temporary password is returned once and is never logged or stored in plaintext.

## Password policy

The shared server policy applies to registration, self-change, forced change, and administrative reset:

- member passwords require at least 12 characters;
- admin and superadmin passwords require at least 16 characters;
- input is capped at 72 UTF-8 bytes while bcrypt remains in use;
- username, email, and long phone fragments are forbidden;
- a bundled common-password denylist rejects values such as `admin123`;
- API responses return policy reason codes without returning the candidate password.

The existing bcrypt hashes remain valid. A later isolated change may migrate hashes to Argon2id; that migration is not required to close this incident path.

## Durable security ledger

Add `auth_security_events`:

```text
id TEXT PRIMARY KEY
event_type TEXT NOT NULL
actor_user_id TEXT NULL
target_user_id TEXT NULL
actor_role TEXT NULL
outcome TEXT NOT NULL
reason_code TEXT NULL
request_id TEXT NOT NULL
source_ip TEXT NULL
user_agent TEXT NULL
metadata_json JSONB NOT NULL DEFAULT '{}'
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Add to `users`:

```text
password_changed_at TIMESTAMPTZ NULL
password_changed_by TEXT NULL
must_change_password BOOLEAN NOT NULL DEFAULT false
last_security_event_at TIMESTAMPTZ NULL
```

Privileged writes and their audit insert share one PostgreSQL transaction and fail closed. Audit metadata uses an allowlist and cannot contain password, password hash, JWT, cookie, authorization header, database URL, API key, or raw request body.

## Login throttling and trusted client identity

Use a dedicated Redis deployment configured by `REDIS_URL`.

Keys use HMAC digests rather than raw usernames or IPs:

```text
auth:login:pair:<digest>     5 failures / 15 minutes
auth:login:account:<digest> 10 failures / 30 minutes
auth:login:ip:<digest>      30 attempts / 15 minutes
```

Limits return `429` with `Retry-After`. A successful login clears the account/IP pair but not the global IP counter. Production auth endpoints return `503` when the required Redis limiter is unavailable; they do not silently fall back to an unprotected path.

Nginx is the only trusted reverse proxy and overwrites, rather than appends untrusted values to, client identity headers. The application process binds to loopback and its port is not public.

## CSRF and cookie policy

- State-changing cookie-authenticated routes validate `Origin` against `APP_ORIGIN`.
- A signed double-submit CSRF token is required in `X-CSRF-Token` for browser mutations.
- Login and registration validate origin to prevent login CSRF.
- Production auth and step-up cookies are `HttpOnly`, `Secure`, and `SameSite=Lax` or stricter.
- Production deployment requires HTTPS and enables HSTS after validation.

## Alerts

High-risk events enqueue a non-secret alert to `SECURITY_ALERT_WEBHOOK_URL`:

- administrator or superadmin password reset;
- role promotion or demotion;
- last-superadmin protection trigger;
- repeated failed step-up authentication;
- Redis/auth-security subsystem failure.

Alert delivery failure does not roll back an already-audited credential change; it records an `alert_delivery_failed` event and is retried out of band.

## Rollout

1. Back up PostgreSQL and preserve Nginx/PM2 logs.
2. Apply additive database migrations and deploy code that understands `superadmin`.
3. Promote the current sole administrator to `superadmin` transactionally.
4. Deploy audit-backed password and role routes, then remove the legacy generic reset endpoint.
5. Deploy dedicated Redis and enable required distributed limiting and step-up storage.
6. Enable CSRF/origin validation after frontend token wiring is live.
7. Put Nginx behind HTTPS, bind the app to loopback, and close public application ports.
8. Rotate JWT, database, SSH, webhook, and provider credentials using the operator runbook.

Rollback never removes the new audit table or user security columns. Application rollback must retain role compatibility and must not restore the unsafe reset endpoint.

## TDD slices

1. Password policy rejects common and account-derived passwords through the public registration route.
2. Self-change rejects a wrong current password and succeeds atomically with audit and session revocation.
3. Admin reset requires step-up and enforces actor/target role boundaries.
4. Last-superadmin protection covers role, status, and deletion paths.
5. Login limiting survives application state changes through a Redis adapter contract.
6. CSRF/origin enforcement rejects cross-site mutations without breaking same-origin requests.
7. Security events redact secrets and are visible only to superadmins.

