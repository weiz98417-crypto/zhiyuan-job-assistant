# Spec Delta: Authentication Security

## ADDED Requirements

### Requirement: Password changes prove current credential ownership

The system SHALL require an authenticated user to prove knowledge of the current password before changing their own password.

#### Scenario: Correct current password

- **WHEN** an authenticated user submits the correct current password and a policy-compliant new password
- **THEN** the system SHALL replace the password hash and increment `token_version`
- **AND** it SHALL record a password-change security event in the same transaction
- **AND** it SHALL clear the current authentication cookie and reject every old token

#### Scenario: Incorrect current password

- **WHEN** an authenticated user submits an incorrect current password
- **THEN** the system SHALL reject the request without changing the hash or token version
- **AND** it SHALL record a failed password-change event without recording either password

### Requirement: Administrative resets require step-up authentication

The system SHALL require recent, purpose-bound reauthentication before an administrator can reset another user's password.

#### Scenario: Admin resets a member

- **WHEN** an admin presents a valid single-use step-up token and resets an active member for a stated reason
- **THEN** the system SHALL generate a temporary password, set `must_change_password=true`, and revoke the member's old sessions
- **AND** the temporary password SHALL be returned once and SHALL NOT be stored in plaintext or audit metadata

#### Scenario: Admin targets an administrator

- **WHEN** an admin attempts to reset an admin or superadmin password
- **THEN** the system SHALL reject the request
- **AND** it SHALL record the denied privileged action

#### Scenario: Actor targets self

- **WHEN** an admin or superadmin uses the administrative reset route against their own id
- **THEN** the system SHALL reject the request and direct the actor to self-service password change

### Requirement: Superadmin protects privileged account ownership

The system SHALL reserve administrator credential and role management for superadmins and preserve at least one active superadmin.

#### Scenario: Last superadmin mutation

- **WHEN** an operation would reject, demote, or delete the final active superadmin
- **THEN** the system SHALL reject the operation without changing durable state
- **AND** it SHALL record a security event for the protected action

#### Scenario: Superadmin changes an administrator role

- **WHEN** a superadmin with valid step-up authentication changes another user's privileged role
- **THEN** the system SHALL update the role, revoke old sessions, and atomically record actor, target, old role, new role, reason, source, and time

### Requirement: Password policy is enforced by every write path

The system SHALL reject weak, common, account-derived, oversized, or underlength passwords at the server boundary.

#### Scenario: Common password submitted directly to an API

- **WHEN** registration, self-change, forced change, or reset receives a common password such as `admin123`
- **THEN** the system SHALL reject it with a stable policy reason code
- **AND** no password hash or user mutation SHALL be written

### Requirement: Authentication security events are durable and secret-free

The system SHALL maintain an append-only PostgreSQL ledger for authentication and privileged identity actions.

#### Scenario: Privileged mutation succeeds

- **WHEN** a password, role, or account status mutation succeeds
- **THEN** the mutation and security event SHALL commit atomically
- **AND** the event SHALL identify actor, target, outcome, request id, trusted source IP, user agent, reason, and timestamp where available

#### Scenario: Audit payload contains a forbidden secret field

- **WHEN** an event producer attempts to include a password, hash, token, cookie, authorization header, database URL, API key, or raw request body
- **THEN** the ledger boundary SHALL reject or redact the forbidden field before persistence

### Requirement: Login throttling is distributed and restart-safe

The system SHALL enforce production login limits through dedicated Redis state keyed by normalized account and trusted client IP.

#### Scenario: Pair limit exceeded

- **WHEN** an account and source IP exceed the configured failed-login limit
- **THEN** subsequent attempts SHALL return `429` with `Retry-After`
- **AND** restarting the application process SHALL NOT clear the limit

#### Scenario: Forwarded IP is spoofed

- **WHEN** an internet client supplies its own forwarding header
- **THEN** the application SHALL use only identity headers overwritten by the trusted reverse proxy
- **AND** spoofed values SHALL NOT produce independent rate-limit buckets

### Requirement: Cookie-authenticated mutations reject cross-site requests

The system SHALL validate origin and CSRF evidence for browser requests that mutate authenticated state.

#### Scenario: Cross-site administrative request

- **WHEN** a state-changing administrative request has an untrusted or missing browser origin or invalid CSRF token
- **THEN** the system SHALL return `403` before performing the mutation

#### Scenario: Same-origin request

- **WHEN** the application frontend supplies the configured origin and valid CSRF token
- **THEN** the security boundary SHALL allow the request to proceed to authentication and authorization

### Requirement: High-risk identity actions produce alerts

The system SHALL notify operators of administrator credential changes, privileged role changes, repeated step-up failures, and authentication security subsystem failures without exposing secrets.

#### Scenario: Administrator password is reset

- **WHEN** a superadmin resets an administrator password
- **THEN** the system SHALL emit an alert containing event id, actor, target, source, time, and outcome
- **AND** it SHALL NOT include the temporary password, password hash, JWT, Cookie, or authorization data

