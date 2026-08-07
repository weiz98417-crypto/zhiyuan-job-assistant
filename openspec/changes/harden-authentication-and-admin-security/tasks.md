# Tasks: harden-authentication-and-admin-security

## 1. Incident Baseline And OpenSpec

- [x] 1.1 Preserve the observed reset sequence and root cause without storing credentials in the change.
- [x] 1.2 Define the superadmin boundary, password flows, audit contract, Redis limits, CSRF policy, and deployment controls.
- [x] 1.3 Validate this OpenSpec change.

## 2. Password Policy And Self-Service Change (TDD)

- [x] 2.1 Add a failing route test proving direct registration rejects common and account-derived passwords.
- [x] 2.2 Implement a shared server password-policy module and wire registration.
- [x] 2.3 Add a failing route test proving self-change requires the correct current password.
- [x] 2.4 Add additive user security columns and repository transaction support.
- [x] 2.5 Implement self-change with atomic audit, token revocation, and cookie clearing.

## 3. Central Authorization And Superadmin Protection (TDD)

- [x] 3.1 Add failing tests for admin, superadmin, self-target, and last-superadmin boundaries.
- [x] 3.2 Extend role types and JWT payloads with `superadmin`.
- [x] 3.3 Add centralized authenticated/admin/superadmin guards and migrate admin APIs.
- [x] 3.4 Protect the last active superadmin from rejection, demotion, and deletion.
- [x] 3.5 Add a safe migration command that promotes the current sole admin to superadmin.

## 4. Step-Up And Administrative Reset (TDD)

- [x] 4.1 Add failing tests for required, expired, mismatched, and reused step-up evidence.
- [x] 4.2 Add a dedicated Redis client boundary and purpose-bound step-up store.
- [x] 4.3 Implement the step-up route and secure step-up cookie.
- [x] 4.4 Replace the legacy arbitrary-password reset route with generated temporary passwords.
- [x] 4.5 Force the target user through password replacement on next login.

## 5. Durable Audit And Security Alerts (TDD)

- [x] 5.1 Add failing tests for atomic privileged audit and forbidden secret redaction.
- [x] 5.2 Add `auth_security_events`, indexes, and append-only repository operations.
- [x] 5.3 Record login, logout, password, role, status, denied-action, and subsystem events.
- [x] 5.4 Add a superadmin-only security event API and administration view.
- [x] 5.5 Add redacted webhook alerts with retryable delivery failure events.

## 6. Distributed Login Limiting And CSRF (TDD)

- [x] 6.1 Add failing tests for account/IP/pair limits and restart-safe Redis semantics.
- [x] 6.2 Replace middleware process-local limiting with the Redis-backed route boundary.
- [x] 6.3 Add trusted-proxy client identity handling and hashed rate-limit keys.
- [x] 6.4 Add failing tests for untrusted origin, missing CSRF, invalid CSRF, and same-origin success.
- [x] 6.5 Add signed CSRF token issuance and validation and wire frontend mutation requests.

## 7. Production Infrastructure

- [x] 7.1 Add dedicated Redis deployment configuration and health checks without reusing unrelated Redis services.
- [x] 7.2 Add Nginx trusted-header, HTTPS, HSTS, loopback binding, and firewall runbook steps.
- [x] 7.3 Add secret-rotation and SSH key-only operator runbook steps without committing secrets.
- [x] 7.4 Add deployment preflight checks for HTTPS, Redis, secure cookies, current schema, and active superadmin count.

## 8. Verification And Rollout

- [x] 8.1 Run focused auth/security tests after every TDD slice.
- [ ] 8.2 Run the full Vitest suite and production build.
- [x] 8.3 Run OpenSpec validation.
- [x] 8.4 Smoke-test login, self-change, forced change, member reset, admin reset denial, role change, audit view, throttling, and CSRF on a non-production database.
- [ ] 8.5 Back up production PostgreSQL, deploy additive schema, promote the current administrator, deploy runtime, and verify read-back.
- [ ] 8.6 Rotate production credentials and verify old JWTs, SSH password login, old database credentials, and weak admin passwords no longer work.

### Verification notes

- 2026-08-07: The production build passed and a disposable `pgvector/pgvector:pg16` database, dedicated Redis instance, and loopback-only Next.js server passed all 8.4 HTTP flows. The smoke run read back 20 append-only security events and removed every temporary process and container afterward.
- 2026-08-07: The full Vitest baseline remains at 586/589 tests. The three failures are in unchanged agent quality, job discovery fixture, and JD eval partial-check paths, so 8.2 remains open rather than reporting a false green result.
