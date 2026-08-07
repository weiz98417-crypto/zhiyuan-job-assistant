import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const guards = vi.hoisted(() => ({ requireSuperadmin: vi.fn() }));
const securityEvents = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/lib/security/auth-guards', () => guards);
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ securityEvents }),
}));

import { GET } from '@/app/api/admin/security-events/route';

describe('security event administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireSuperadmin.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 1,
    });
    securityEvents.list.mockResolvedValue({
      events: [{
        id: 'event-1',
        eventType: 'login_failure',
        actorUserId: 'member-1',
        outcome: 'failure',
        reasonCode: 'INVALID_CREDENTIALS',
        requestId: 'request-1',
        metadata: {},
        createdAt: '2026-08-06T15:00:00.000Z',
      }],
      total: 1,
    });
  });

  it('returns a filtered, bounded page to a superadmin', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/security-events?outcome=failure&eventType=login_failure&limit=500&offset=2',
    ));

    expect(response.status).toBe(200);
    expect(securityEvents.list).toHaveBeenCalledWith({
      outcome: 'failure', eventType: 'login_failure', limit: 100, offset: 2,
    });
    await expect(response.json()).resolves.toMatchObject({ total: 1 });
  });

  it('rejects callers outside the superadmin boundary', async () => {
    guards.requireSuperadmin.mockRejectedValue(Object.assign(
      new Error('Forbidden'),
      { status: 403, code: 'SUPERADMIN_REQUIRED' },
    ));

    const response = await GET(new NextRequest(
      'http://localhost/api/admin/security-events',
    ));

    expect(response.status).toBe(403);
    expect(securityEvents.list).not.toHaveBeenCalled();
  });
});
