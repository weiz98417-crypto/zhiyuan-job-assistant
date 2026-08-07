import { describe, expect, it, vi } from 'vitest';
import { runSecurityAlertRetryBatch } from '../../scripts/lib/security-alert-retry.mjs';

function retryCandidate(overrides: Record<string, unknown> = {}) {
  return {
    failure_id: 'failure-1',
    failure_metadata: {
      sourceEventId: 'event-1',
      sourceEventType: 'role_change',
      retryable: true,
      attempt: 1,
      nextAttemptAfterSeconds: 60,
    },
    failure_actor_user_id: 'owner-1',
    failure_target_user_id: 'admin-1',
    failure_actor_role: 'superadmin',
    failure_request_id: 'request-1',
    failure_source_ip: '203.0.113.10',
    source_id: 'event-1',
    source_event_type: 'role_change',
    source_actor_user_id: 'owner-1',
    source_target_user_id: 'admin-1',
    source_actor_role: 'superadmin',
    source_outcome: 'success',
    source_reason_code: null,
    source_request_id: 'request-1',
    source_source_ip: '203.0.113.10',
    source_metadata: {
      oldRole: 'admin',
      newRole: 'superadmin',
      password: 'must-not-leak',
    },
    ...overrides,
  };
}

function fakeClient(rows = [retryCandidate()]) {
  const inserted: unknown[][] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
    if (sql.includes('FROM auth_security_events AS failure')) return { rows };
    if (sql.includes('INSERT INTO auth_security_events')) {
      inserted.push(params || []);
      return { rows: [] };
    }
    if (sql.includes('pg_advisory_unlock')) return { rows: [{ released: true }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { query, inserted };
}

const environment = {
  NODE_ENV: 'production',
  SECURITY_ALERT_WEBHOOK_URL: 'https://alerts.example/hooks/security',
  SECURITY_ALERT_WEBHOOK_BEARER_TOKEN: 'webhook-secret',
};

describe('security alert retry worker', () => {
  it('retries one eligible leaf failure and appends a success event', async () => {
    const client = fakeClient();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await runSecurityAlertRetryBatch({
      client,
      fetchImpl: fetchMock,
      environment,
      now: new Date('2026-08-07T08:00:00.000Z'),
      randomUUID: () => 'retry-success-1',
    });

    expect(result).toEqual({
      lockAcquired: true,
      selected: 1,
      succeeded: 1,
      deferred: 0,
      abandoned: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer webhook-secret',
      'Idempotency-Key': 'event-1',
    });
    const outbound = String(init.body);
    expect(outbound).toContain('[REDACTED]');
    expect(outbound).not.toContain('must-not-leak');
    expect(outbound).not.toContain('webhook-secret');

    expect(client.inserted).toHaveLength(1);
    expect(client.inserted[0][0]).toBe('retry-success-1');
    expect(client.inserted[0][1]).toBe('alert_delivery_retry_succeeded');
    expect(client.inserted[0][5]).toBe('success');
    expect(JSON.parse(String(client.inserted[0][10]))).toMatchObject({
      sourceEventId: 'event-1',
      sourceFailureEventId: 'failure-1',
      attempt: 2,
      webhookHost: 'alerts.example',
    });
    expect(JSON.stringify(client.inserted)).not.toContain('/hooks/security');
    expect(JSON.stringify(client.inserted)).not.toContain('webhook-secret');
  });

  it('appends a child failure with exponential backoff after a retryable response', async () => {
    const client = fakeClient();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    const result = await runSecurityAlertRetryBatch({
      client,
      fetchImpl: fetchMock,
      environment,
      now: new Date('2026-08-07T08:00:00.000Z'),
      randomUUID: () => 'retry-failure-2',
    });

    expect(result).toMatchObject({ selected: 1, succeeded: 0, deferred: 1, abandoned: 0 });
    expect(client.inserted).toHaveLength(1);
    expect(client.inserted[0][1]).toBe('alert_delivery_failed');
    expect(client.inserted[0][5]).toBe('failure');
    expect(client.inserted[0][6]).toBe('WEBHOOK_HTTP_ERROR');
    expect(JSON.parse(String(client.inserted[0][10]))).toMatchObject({
      sourceEventId: 'event-1',
      sourceFailureEventId: 'failure-1',
      retryable: true,
      status: 503,
      attempt: 2,
      nextAttemptAfterSeconds: 120,
    });
  });

  it.each([
    {
      name: 'the retry limit is reached',
      candidate: retryCandidate({
        failure_metadata: {
          sourceEventId: 'event-1',
          sourceEventType: 'role_change',
          retryable: true,
          attempt: 4,
          nextAttemptAfterSeconds: 480,
        },
      }),
      status: 503,
      reasonCode: 'RETRY_LIMIT_REACHED',
      attempt: 5,
    },
    {
      name: 'the webhook rejects the event permanently',
      candidate: retryCandidate(),
      status: 400,
      reasonCode: 'WEBHOOK_HTTP_ERROR',
      attempt: 2,
    },
  ])('abandons delivery when $name', async ({ candidate, status, reasonCode, attempt }) => {
    const client = fakeClient([candidate]);

    const result = await runSecurityAlertRetryBatch({
      client,
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status })),
      environment,
      now: new Date('2026-08-07T08:00:00.000Z'),
      randomUUID: () => 'retry-abandoned-1',
    });

    expect(result).toMatchObject({ selected: 1, succeeded: 0, deferred: 0, abandoned: 1 });
    expect(client.inserted).toHaveLength(1);
    expect(client.inserted[0][1]).toBe('alert_delivery_abandoned');
    expect(client.inserted[0][6]).toBe(reasonCode);
    expect(JSON.parse(String(client.inserted[0][10]))).toMatchObject({
      sourceEventId: 'event-1',
      sourceFailureEventId: 'failure-1',
      retryable: false,
      status,
      attempt,
      lastDeliveryReasonCode: 'WEBHOOK_HTTP_ERROR',
    });
  });

  it('abandons an orphaned failure without sending an empty alert', async () => {
    const client = fakeClient([retryCandidate({ source_id: null })]);
    const fetchMock = vi.fn();

    const result = await runSecurityAlertRetryBatch({
      client,
      fetchImpl: fetchMock,
      environment,
      now: new Date('2026-08-07T08:00:00.000Z'),
      randomUUID: () => 'retry-orphan-1',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ selected: 1, abandoned: 1 });
    expect(client.inserted[0][1]).toBe('alert_delivery_abandoned');
    expect(client.inserted[0][6]).toBe('SOURCE_EVENT_NOT_FOUND');
    expect(JSON.parse(String(client.inserted[0][10]))).toMatchObject({
      sourceEventId: 'event-1',
      sourceFailureEventId: 'failure-1',
      retryable: false,
    });
  });
});
