# Spec Delta: Authentication Security

## ADDED Requirements

### Requirement: Users can request password recovery without account enumeration

The system SHALL accept a password-recovery request from the login experience without revealing whether the submitted account exists.

#### Scenario: Active account is submitted

- **WHEN** a visitor submits the username or email of an active account within rate limits
- **THEN** the system SHALL create or refresh one pending recovery request for that account
- **AND** it SHALL return the generic accepted response
- **AND** it SHALL record a secret-free security event

#### Scenario: Unknown account is submitted

- **WHEN** a visitor submits an identifier that does not match an active account
- **THEN** the system SHALL return the same status, code, and message used for a known account
- **AND** it SHALL NOT create a recovery request

#### Scenario: Request limit is exceeded

- **WHEN** an account or source IP exceeds the recovery-request limit
- **THEN** the system SHALL return `429` with `Retry-After`
- **AND** production SHALL fail closed when the dedicated Redis limiter is unavailable

### Requirement: Recovery requests require superadmin review

The system SHALL expose pending recovery requests only to superadmins and SHALL use the existing step-up-protected temporary-password reset to complete recovery.

#### Scenario: Superadmin completes recovery

- **WHEN** a superadmin verifies identity, passes purpose-bound step-up authentication, and resets the linked account
- **THEN** password replacement, token-version increment, request completion, and audit insertion SHALL commit atomically
- **AND** the one-time temporary password SHALL be returned only in the reset response
- **AND** the user SHALL be forced to replace it at the next login

#### Scenario: Ordinary admin lists recovery requests

- **WHEN** an admin who is not a superadmin loads user management
- **THEN** no pending recovery request data SHALL be returned

### Requirement: Password management is discoverable

The system SHALL link unauthenticated users to password recovery from login and authenticated users to password change from personal settings.
