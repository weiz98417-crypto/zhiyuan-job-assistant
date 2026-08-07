import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const guards = vi.hoisted(() => ({ requireAuthenticated: vi.fn() }));
const securityEvents = vi.hoisted(() => ({ append: vi.fn() }));

vi.mock('@/lib/security/auth-guards', () => guards);
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ securityEvents }),
}));

import { POST } from '@/app/api/auth/logout/route';

describe('logout audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireAuthenticated.mockResolvedValue({
      userId: 'member-1', username: 'member', role: 'member', tokenVersion: 2,
    });
  });

  it('records logout and expires both auth-bound cookies', async () => {
    const response = await POST(new NextRequest('https://app.example/api/auth/logout', {
      method: 'POST',
      headers: { 'x-real-ip': '203.0.113.10', 'user-agent': 'vitest-browser' },
    }));

    expect(response.status).toBe(200);
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'logout',
      actorUserId: 'member-1',
      targetUserId: 'member-1',
      outcome: 'success',
      sourceIp: '203.0.113.10',
    }));
    const cookies = response.headers.get('set-cookie') || '';
    expect(cookies).toContain('auth_token=');
    expect(cookies).toContain('csrf_token=');
    expect(cookies).toContain('Max-Age=0');
  });
});
