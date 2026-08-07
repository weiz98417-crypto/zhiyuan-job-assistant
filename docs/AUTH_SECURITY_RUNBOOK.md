# Authentication Security Production Runbook

This runbook applies to the Zhiyuan production deployment. Never place real passwords, tokens, private keys, or connection strings in Git, shell history, tickets, or chat transcripts.

## Required topology

```text
Internet -> 443/Nginx -> 127.0.0.1:3000/Next.js
                         |-> PostgreSQL/pgvector
                         |-> 127.0.0.1:6380/dedicated auth Redis
                         |-> HTTPS security alert webhook
```

- Nginx is the only public HTTP entry point.
- Next.js binds to `127.0.0.1`; port 3000 is not open in the cloud security group or host firewall.
- The authentication Redis instance is not shared with queues, caches, or model workers. Its host port is loopback-only and AOF is enabled.
- Nginx overwrites `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`. It never passes client-supplied forwarding headers unchanged.

## Prepare secrets

Generate independent random values for `JWT_SECRET`, `CSRF_SECRET`, `AUTH_RATE_LIMIT_SECRET`, the Redis password, database credential, and webhook bearer token. Each application secret must contain at least 32 random characters.

Create the Redis Docker secret directly on the server:

```bash
install -d -m 700 deploy/auth-security/secrets
openssl rand -base64 48 > deploy/auth-security/secrets/redis_password
chmod 600 deploy/auth-security/secrets/redis_password
docker compose -f deploy/auth-security/docker-compose.yml up -d
```

Set `.env.local` permissions to `600`. Construct `REDIS_URL` from the server-side password without printing it into logs. Use `redis://:<password>@127.0.0.1:6380/0`.
If loopback port `6380` is already allocated, set `AUTH_REDIS_BIND_PORT` before starting Compose and use the same port in `REDIS_URL`. Do not reuse the service already occupying that port.

## Database and superadmin migration

1. Stop application writes.
2. Back up PostgreSQL and verify the backup exists and is non-empty.
3. Apply the additive schema in `src/lib/postgres-schema.sql`.
4. Dry-run the sole-admin promotion against the expected account.
5. Apply it once and verify the role and security ledger.

```bash
npm run backup:postgres -- --output data/backups/auth-hardening-before.json
npm run check:postgres
npm run security:promote-superadmin -- --dry-run --driver postgres --username <expected-admin>
npm run security:promote-superadmin -- --apply --driver postgres --username <expected-admin>
```

The promotion command refuses zero or multiple active privileged accounts and refuses an unexpected username. It increments `token_version` and appends a `role_change` event atomically.

## Nginx, TLS, and firewall

1. Replace the example hostname and certificate paths in `deploy/auth-security/nginx.conf.example`.
2. Validate with `nginx -t`, reload Nginx, and confirm HTTPS before enabling long-lived HSTS.
3. Start Next.js with a loopback bind, for example `next start -H 127.0.0.1 -p 3000`.
4. Allow inbound TCP 22, 80, and 443 only. Restrict port 22 to operator source addresses when possible.
5. Deny public access to 3000, 5432, and 6380 in both the Alibaba Cloud security group and the host firewall.

HSTS can lock clients onto HTTPS. Do not enable the one-year header until the certificate, redirects, subdomains, and renewal job have been verified.

## SSH hardening and credential rotation

1. Create a named operator account and install an Ed25519 public key.
2. Verify a second key-authenticated SSH session before changing sshd.
3. Set `PermitRootLogin prohibit-password`, `PasswordAuthentication no`, and `PubkeyAuthentication yes`.
4. Validate with `sshd -t`, reload sshd, and verify another new session before closing the old one.
5. Rotate the previously exposed root password even after password login is disabled.
6. Rotate `JWT_SECRET`, database credentials, Redis password, webhook credentials, and provider keys. Revoke or delete old values after read-back succeeds.

Rotating `JWT_SECRET` intentionally invalidates all existing sessions. Schedule it as a user-visible logout event.

## Deployment preflight

The deploy must fail when the preflight fails:

```bash
npm run security:preflight
```

It checks production mode, HTTPS origin, secure-cookie override, loopback binding, independent secrets, PostgreSQL connectivity and security columns, append-only audit trigger, at least one active superadmin, Redis connectivity and AOF persistence, public HTTPS reachability, and HSTS.

Use `--skip-network` only while staging Nginx before DNS/TLS is live. A production rollout is not complete until the command passes without that flag.

## Security alert retry worker

Run `npm run security:retry-alerts` as a short-lived scheduled process every minute. Each invocation selects only due, retryable leaf failures and exits after one bounded batch. A PostgreSQL advisory lock prevents overlapping hosts from delivering the same batch concurrently.

The initial delivery plus retries use the original security event id as `Idempotency-Key`. Retry delays grow exponentially from 60 seconds and cap at one hour. The default maximum is five total delivery attempts. Configure `SECURITY_ALERT_RETRY_BATCH_SIZE` and `SECURITY_ALERT_MAX_ATTEMPTS` only through the server environment.

The append-only ledger records `alert_delivery_retry_succeeded`, a child `alert_delivery_failed`, or `alert_delivery_abandoned`. Alert when abandoned events appear or when the worker exits non-zero. Worker output contains counts only; do not add webhook URLs, bearer tokens, payloads, or database connection strings to process-manager logs.

## Post-deploy read-back

- Log in with a non-production member account and confirm account/IP/pair throttling returns `429` with `Retry-After` after the configured threshold.
- Change that account's password and confirm all prior sessions are revoked.
- Reset a member through step-up and confirm the temporary password is shown once and forces replacement.
- Confirm an ordinary admin cannot reset or alter another privileged account.
- Confirm a superadmin can read `/admin/security-events` and other roles cannot.
- Trigger a controlled denied privileged action and verify the audit event and alert delivery.
- Trigger a controlled retryable webhook failure, restore the webhook, run `npm run security:retry-alerts`, and verify `alert_delivery_retry_succeeded` is appended once.
- Verify application, Nginx, Redis, PostgreSQL, and webhook logs contain no passwords, cookies, authorization headers, JWTs, or database URLs.

## Rollback

Application rollback must retain `superadmin` compatibility, security columns, and the append-only event table. Never restore the legacy arbitrary-password reset endpoint. Keep Redis, HTTPS controls, and the alert retry worker active during rollback. If a rollback cannot understand the new role or token version, restore service from the forward-compatible release instead.
