# Change: add secure password recovery

## Why

The authentication hardening change delivered authenticated password changes and audited administrative resets, but it did not provide a discoverable password-change entry or a recovery path from the login page. Users who forget their password currently have no way to ask for recovery, while implementing a direct reset from an unverified username or email would recreate an account-takeover path.

## What Changes

- Add a visible password-change entry in personal settings.
- Add a public password-recovery request page linked from login.
- Store one durable pending recovery request per account without storing the submitted identifier.
- Return the same response whether or not an account exists and rate-limit public requests.
- Show pending recovery requests only to superadmins in user management.
- Reuse the existing step-up-protected temporary-password reset and resolve the linked request atomically.

## Out of Scope

- Email or SMS reset links. The project has no verified recovery channel or configured delivery provider.
- Direct password replacement from the public recovery page.
- Automatic identity approval based on an unverified registration email.
