import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const securityEvents = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ securityEvents }),
}));

import { sendSecurityAlert } from '@/lib/security/security-alerts';

const event = {
  id: 'event-role-change',
  eventType: 'role_change',
  actorUserId: 'owner-1',
  targetUserId: 'admin-1',
  actorRole: 'superadmin',
  outcome: 'success',
  requestId: 'request-1',
  sourceIp: '203.0.113.10',
  metadata: {
    oldRole: 'admin',
    newRole: 'superadmin',
    password: 'never-send-this',
    nested: { authorization: 'Bearer never-send-this-either' },
  },
};

describe('security webhook alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECURITY_ALERT_WEBHOOK_URL = 'https://alerts.example/hooks/security';
    process.env.SECURITY_ALERT_WEBHOOK_BEARER_TOKEN = 'webhook-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SECURITY_ALERT_WEBHOOK_URL;
    delete process.env.SECURITY_ALERT_WEBHOOK_BEARER_TOKEN;
  });

  it('delivers a bounded redacted event without exposing transport credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendSecurityAlert(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const payload = String(init.body);
    expect(payload).toContain('event-role-change');
    expect(payload).toContain('[REDACTED]');
    expect(payload).not.toContain('never-send-this');
    expect(payload).not.toContain('webhook-secret');
    expect(init.headers.Authorization).toBe('Bearer webhook-secret');
    expect(init.headers['Idempotency-Key']).toBe('event-role-change');
    expect(securityEvents.append).not.toHaveBeenCalled();
  });

  it('records a retryable failure without rolling back or leaking the webhook path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await sendSecurityAlert(event);

    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'alert_delivery_failed',
      outcome: 'failure',
      reasonCode: 'WEBHOOK_HTTP_ERROR',
      metadata: expect.objectContaining({
        sourceEventId: 'event-role-change',
        webhookHost: 'alerts.example',
        retryable: true,
        attempt: 1,
      }),
    }));
    const persisted = JSON.stringify(securityEvents.append.mock.calls);
    expect(persisted).not.toContain('/hooks/security');
    expect(persisted).not.toContain('webhook-secret');
  });
});
