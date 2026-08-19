import crypto from 'crypto';

const RETRY_LOCK_NAME = 'zhiyuan:security-alert-retry:v1';
const ALERT_TIMEOUT_MS = 5_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_ATTEMPTS = 5;

const SECRET_KEY_PARTS = [
  'password',
  'passwd',
  'pwd',
  'token',
  'cookie',
  'authorization',
  'databaseurl',
  'apikey',
  'clientsecret',
  'rawbody',
];

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isSecretKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitize(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? value.slice(0, 2_000) : value;
  }

  const clean = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    clean[key] = isSecretKey(key) ? '[REDACTED]' : sanitize(child, depth + 1);
  }
  return clean;
}

function readWebhook(environment) {
  const configuredUrl = environment.SECURITY_ALERT_WEBHOOK_URL?.trim();
  if (!configuredUrl) throw new Error('SECURITY_ALERT_WEBHOOK_URL is required');
  const url = new URL(configuredUrl);
  if (environment.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('SECURITY_ALERT_WEBHOOK_URL must use HTTPS in production');
  }
  return url;
}

async function loadEligibleFailures(client, now, batchSize) {
  const result = await client.query(`
    SELECT
      failure.id AS failure_id,
      failure.metadata_json AS failure_metadata,
      failure.actor_user_id AS failure_actor_user_id,
      failure.target_user_id AS failure_target_user_id,
      failure.actor_role AS failure_actor_role,
      failure.request_id AS failure_request_id,
      failure.source_ip AS failure_source_ip,
      source.id AS source_id,
      source.event_type AS source_event_type,
      source.actor_user_id AS source_actor_user_id,
      source.target_user_id AS source_target_user_id,
      source.actor_role AS source_actor_role,
      source.outcome AS source_outcome,
      source.reason_code AS source_reason_code,
      source.request_id AS source_request_id,
      source.source_ip AS source_source_ip,
      source.metadata_json AS source_metadata
    FROM auth_security_events AS failure
    LEFT JOIN auth_security_events AS source
      ON source.id = failure.metadata_json ->> 'sourceEventId'
    WHERE failure.event_type = 'alert_delivery_failed'
      AND COALESCE(failure.metadata_json ->> 'retryable', 'false') = 'true'
      AND failure.created_at + make_interval(secs => CASE
        WHEN COALESCE(failure.metadata_json ->> 'nextAttemptAfterSeconds', '') ~ '^[0-9]+$'
          THEN (failure.metadata_json ->> 'nextAttemptAfterSeconds')::integer
        ELSE 60
      END) <= $1
      AND NOT EXISTS (
        SELECT 1
        FROM auth_security_events AS child
        WHERE child.event_type IN (
          'alert_delivery_failed',
          'alert_delivery_retry_succeeded',
          'alert_delivery_abandoned'
        )
          AND child.metadata_json ->> 'sourceFailureEventId' = failure.id
      )
    ORDER BY failure.created_at ASC, failure.id ASC
    LIMIT $2
  `, [now.toISOString(), batchSize]);
  return result.rows;
}

function sourceEventFromCandidate(candidate) {
  if (!candidate.source_id) return null;
  return {
    id: String(candidate.source_id),
    eventType: String(candidate.source_event_type),
    actorUserId: candidate.source_actor_user_id || undefined,
    targetUserId: candidate.source_target_user_id || undefined,
    actorRole: candidate.source_actor_role || undefined,
    outcome: String(candidate.source_outcome),
    reasonCode: candidate.source_reason_code || undefined,
    requestId: String(candidate.source_request_id),
    sourceIp: candidate.source_source_ip || undefined,
    metadata: sanitize(parseObject(candidate.source_metadata)),
  };
}

function buildPayload(event, emittedAt) {
  return {
    schemaVersion: 1,
    emittedAt: emittedAt.toISOString(),
    event,
  };
}

function retryDelaySeconds(attempt) {
  return Math.min(60 * (2 ** Math.max(0, attempt - 1)), 3_600);
}

async function deliverAlert({ event, fetchImpl, url, bearer, now }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': event.id,
    };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(buildPayload(event, now)),
    });
    return {
      ok: response.ok,
      status: response.status,
      reasonCode: response.ok ? undefined : 'WEBHOOK_HTTP_ERROR',
      retryable: !response.ok && (response.status === 429 || response.status >= 500),
    };
  } catch {
    return { ok: false, reasonCode: 'WEBHOOK_NETWORK_ERROR', retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function appendResultEvent(client, event) {
  await client.query(`
    INSERT INTO auth_security_events (
      id, event_type, actor_user_id, target_user_id, actor_role, outcome,
      reason_code, request_id, source_ip, user_agent, metadata_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
  `, [
    event.id,
    event.eventType,
    event.actorUserId || null,
    event.targetUserId || null,
    event.actorRole || null,
    event.outcome,
    event.reasonCode || null,
    event.requestId,
    event.sourceIp || null,
    'security-alert-retry-worker',
    JSON.stringify(sanitize(event.metadata)),
  ]);
}

export async function runSecurityAlertRetryBatch({
  client,
  fetchImpl = fetch,
  environment = process.env,
  now = new Date(),
  randomUUID = () => crypto.randomUUID(),
  batchSize = DEFAULT_BATCH_SIZE,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  const url = readWebhook(environment);
  const bearer = environment.SECURITY_ALERT_WEBHOOK_BEARER_TOKEN?.trim();
  const lock = await client.query(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
    [RETRY_LOCK_NAME],
  );
  const lockAcquired = lock.rows[0]?.acquired === true;
  if (!lockAcquired) {
    return { lockAcquired: false, selected: 0, succeeded: 0, deferred: 0, abandoned: 0 };
  }

  const counts = { lockAcquired: true, selected: 0, succeeded: 0, deferred: 0, abandoned: 0 };
  try {
    const candidates = await loadEligibleFailures(client, now, batchSize);
    counts.selected = candidates.length;
    for (const candidate of candidates) {
      const source = sourceEventFromCandidate(candidate);
      const failureMetadata = parseObject(candidate.failure_metadata);
      const attempt = Math.max(1, Number(failureMetadata.attempt) || 1) + 1;
      if (!source) {
        await appendResultEvent(client, {
          id: randomUUID(),
          eventType: 'alert_delivery_abandoned',
          actorUserId: candidate.failure_actor_user_id || undefined,
          targetUserId: candidate.failure_target_user_id || undefined,
          actorRole: candidate.failure_actor_role || undefined,
          outcome: 'failure',
          reasonCode: 'SOURCE_EVENT_NOT_FOUND',
          requestId: String(candidate.failure_request_id),
          sourceIp: candidate.failure_source_ip || undefined,
          metadata: {
            sourceEventId: failureMetadata.sourceEventId,
            sourceEventType: failureMetadata.sourceEventType,
            sourceFailureEventId: String(candidate.failure_id),
            webhookHost: url.hostname,
            retryable: false,
            attempt,
          },
        });
        counts.abandoned += 1;
        continue;
      }
      const delivery = await deliverAlert({ event: source, fetchImpl, url, bearer, now });
      if (!delivery.ok && delivery.retryable && attempt < maxAttempts) {
        await appendResultEvent(client, {
          id: randomUUID(),
          eventType: 'alert_delivery_failed',
          actorUserId: source.actorUserId,
          targetUserId: source.targetUserId,
          actorRole: source.actorRole,
          outcome: 'failure',
          reasonCode: delivery.reasonCode,
          requestId: source.requestId,
          sourceIp: source.sourceIp,
          metadata: {
            sourceEventId: source.id,
            sourceEventType: source.eventType,
            sourceFailureEventId: String(candidate.failure_id),
            webhookHost: url.hostname,
            retryable: true,
            status: delivery.status,
            attempt,
            nextAttemptAfterSeconds: retryDelaySeconds(attempt),
          },
        });
        counts.deferred += 1;
        continue;
      }
      if (!delivery.ok) {
        await appendResultEvent(client, {
          id: randomUUID(),
          eventType: 'alert_delivery_abandoned',
          actorUserId: source.actorUserId,
          targetUserId: source.targetUserId,
          actorRole: source.actorRole,
          outcome: 'failure',
          reasonCode: delivery.retryable && attempt >= maxAttempts
            ? 'RETRY_LIMIT_REACHED'
            : delivery.reasonCode,
          requestId: source.requestId,
          sourceIp: source.sourceIp,
          metadata: {
            sourceEventId: source.id,
            sourceEventType: source.eventType,
            sourceFailureEventId: String(candidate.failure_id),
            webhookHost: url.hostname,
            retryable: false,
            status: delivery.status,
            attempt,
            lastDeliveryReasonCode: delivery.reasonCode,
          },
        });
        counts.abandoned += 1;
        continue;
      }

      await appendResultEvent(client, {
        id: randomUUID(),
        eventType: 'alert_delivery_retry_succeeded',
        actorUserId: source.actorUserId,
        targetUserId: source.targetUserId,
        actorRole: source.actorRole,
        outcome: 'success',
        requestId: source.requestId,
        sourceIp: source.sourceIp,
        metadata: {
          sourceEventId: source.id,
          sourceEventType: source.eventType,
          sourceFailureEventId: String(candidate.failure_id),
          webhookHost: url.hostname,
          attempt: Math.min(attempt, maxAttempts),
        },
      });
      counts.succeeded += 1;
    }
    return counts;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1)) AS released', [RETRY_LOCK_NAME]);
  }
}
