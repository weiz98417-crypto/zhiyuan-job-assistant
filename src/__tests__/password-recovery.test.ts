import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const users = vi.hoisted(() => ({
  findByUsernameOrEmail: vi.fn(),
  list: vi.fn(),
}));
const passwordRecoveryRequests = vi.hoisted(() => ({
  submitForUser: vi.fn(),
  listPending: vi.fn(),
}));
const limiter = vi.hoisted(() => ({ consume: vi.fn() }));
const guards = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({
    assertReady: vi.fn(),
    users,
    passwordRecoveryRequests,
  }),
}));

vi.mock('@/lib/security/password-recovery-rate-limit', async () => {
  class PasswordRecoveryRateLimitUnavailableError extends Error {}
  return {
    PasswordRecoveryRateLimitUnavailableError,
    getPasswordRecoveryRateLimiter: () => limiter,
  };
});

vi.mock('@/lib/security/auth-guards', () => guards);

import { POST as requestRecovery } from '@/app/api/auth/password/recovery-request/route';
import { GET as listUsers } from '@/app/api/admin/users/route';
import { PasswordRecoveryRateLimitUnavailableError } from '@/lib/security/password-recovery-rate-limit';

const activeMember = {
  id: 'member-1',
  username: 'memberone',
  email: 'member@example.com',
  display_name: 'Member One',
  password_hash: 'hash',
  role: 'member',
  status: 'active',
  token_version: 1,
  created_at: '2026-08-01T00:00:00.000Z',
  last_login_at: null,
};

function recoveryRequest(account: string) {
  return new NextRequest('https://example.test/api/auth/password/recovery-request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest-browser',
      'x-real-ip': '203.0.113.10',
    },
    body: JSON.stringify({ account }),
  });
}

describe('public password recovery request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiter.consume.mockResolvedValue({ allowed: true });
    users.findByUsernameOrEmail.mockResolvedValue(activeMember);
    passwordRecoveryRequests.submitForUser.mockResolvedValue({
      id: 'recovery-1',
      userId: activeMember.id,
      status: 'pending',
      requestedAt: '2026-08-07T00:00:00.000Z',
    });
  });

  it('returns the same accepted response for known and unknown accounts', async () => {
    const known = await requestRecovery(recoveryRequest('memberone'));
    const knownBody = await known.json();

    users.findByUsernameOrEmail.mockResolvedValueOnce(undefined);
    const unknown = await requestRecovery(recoveryRequest('does-not-exist'));
    const unknownBody = await unknown.json();

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(knownBody).toEqual(unknownBody);
    expect(knownBody).toMatchObject({ code: 'RECOVERY_REQUEST_ACCEPTED' });
    expect(passwordRecoveryRequests.submitForUser).toHaveBeenCalledTimes(1);
    expect(passwordRecoveryRequests.submitForUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: activeMember.id,
      sourceIp: '203.0.113.10',
    }));
    expect(JSON.stringify(passwordRecoveryRequests.submitForUser.mock.calls)).not.toContain('memberone');
  });

  it('does not create a recovery request for an inactive account', async () => {
    users.findByUsernameOrEmail.mockResolvedValue({ ...activeMember, status: 'rejected' });

    const response = await requestRecovery(recoveryRequest('memberone'));

    expect(response.status).toBe(202);
    expect(passwordRecoveryRequests.submitForUser).not.toHaveBeenCalled();
  });

  it('returns retry information when the public request limit is exceeded', async () => {
    limiter.consume.mockResolvedValue({
      allowed: false,
      reason: 'ACCOUNT_LIMIT',
      retryAfterSeconds: 1800,
    });

    const response = await requestRecovery(recoveryRequest('memberone'));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1800');
    expect(passwordRecoveryRequests.submitForUser).not.toHaveBeenCalled();
  });

  it('fails closed when the production recovery limiter is unavailable', async () => {
    limiter.consume.mockRejectedValue(new PasswordRecoveryRateLimitUnavailableError('redis unavailable'));

    const response = await requestRecovery(recoveryRequest('memberone'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_SECURITY_UNAVAILABLE' });
    expect(passwordRecoveryRequests.submitForUser).not.toHaveBeenCalled();
  });
});

describe('password recovery request visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    users.list.mockResolvedValue([activeMember]);
    passwordRecoveryRequests.listPending.mockResolvedValue([{
      id: 'recovery-1',
      userId: activeMember.id,
      status: 'pending',
      requestedAt: '2026-08-07T00:00:00.000Z',
    }]);
  });

  it('projects pending recovery requests for superadmins', async () => {
    guards.requireAdmin.mockResolvedValue({ userId: 'owner-1', role: 'superadmin' });

    const response = await listUsers(new NextRequest('https://example.test/api/admin/users'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users[0].passwordRecovery).toMatchObject({ id: 'recovery-1' });
    expect(passwordRecoveryRequests.listPending).toHaveBeenCalledOnce();
  });

  it('does not expose recovery requests to ordinary admins', async () => {
    guards.requireAdmin.mockResolvedValue({ userId: 'admin-1', role: 'admin' });

    const response = await listUsers(new NextRequest('https://example.test/api/admin/users'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users[0].passwordRecovery).toBeUndefined();
    expect(passwordRecoveryRequests.listPending).not.toHaveBeenCalled();
  });
});
