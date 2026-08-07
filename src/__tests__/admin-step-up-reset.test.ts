import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
}));
const guards = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));
const users = vi.hoisted(() => ({
  findById: vi.fn(),
  resetPasswordWithAudit: vi.fn(),
}));
const securityEvents = vi.hoisted(() => ({ append: vi.fn() }));
const stepUpStore = vi.hoisted(() => ({
  issue: vi.fn(),
  consume: vi.fn(),
}));
const stepUpFailures = vi.hoisted(() => ({ recordFailure: vi.fn() }));
const alerts = vi.hoisted(() => ({ sendSecurityAlert: vi.fn() }));

vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/security/auth-guards', () => guards);
vi.mock('@/lib/security/step-up-store', () => ({
  STEP_UP_PURPOSES: ['admin_password_reset', 'admin_user_management'],
  getStepUpStore: () => stepUpStore,
}));
vi.mock('@/lib/security/step-up-failure-tracker', () => ({
  getStepUpFailureTracker: () => stepUpFailures,
}));
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ users, securityEvents }),
}));
vi.mock('@/lib/security/security-alerts', () => alerts);

import { POST as createStepUp } from '@/app/api/auth/step-up/route';
import { POST as resetPassword } from '@/app/api/admin/users/[id]/password-reset/route';

const admin = {
  userId: 'admin-1',
  username: 'adminuser',
  role: 'admin' as const,
  tokenVersion: 4,
};
const member = {
  id: 'member-1',
  username: 'memberone',
  email: 'member@example.com',
  password_hash: 'member-password-hash',
  role: 'member',
  status: 'active',
  token_version: 2,
};
const context = { params: Promise.resolve({ id: 'member-1' }) };

function post(url: string, body: Record<string, unknown>, cookie?: string) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest-browser',
      'x-real-ip': '203.0.113.10',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('administrative step-up and password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireAdmin.mockResolvedValue(admin);
    users.findById.mockImplementation(async (id: string) => (
      id === admin.userId
        ? { ...admin, id: admin.userId, password_hash: 'admin-password-hash', status: 'active' }
        : member
    ));
    auth.comparePassword.mockResolvedValue(true);
    auth.hashPassword.mockResolvedValue('temporary-password-hash');
    stepUpStore.issue.mockResolvedValue(undefined);
    stepUpStore.consume.mockResolvedValue({ ok: true });
    stepUpFailures.recordFailure.mockResolvedValue({
      count: 1,
      ttlSeconds: 900,
      shouldAlert: false,
    });
    users.resetPasswordWithAudit.mockResolvedValue(true);
  });

  it('alerts after the fifth failed step-up password verification', async () => {
    auth.comparePassword.mockResolvedValue(false);
    stepUpFailures.recordFailure.mockResolvedValue({
      count: 5,
      ttlSeconds: 840,
      shouldAlert: true,
    });

    const response = await createStepUp(post(
      'https://example.test/api/auth/step-up',
      { password: 'Wrong!AdminPassword2026', purpose: 'admin_password_reset' },
    ));

    expect(response.status).toBe(401);
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up',
      outcome: 'failure',
      reasonCode: 'CURRENT_PASSWORD_INVALID',
    }));
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up_failure_threshold',
      outcome: 'failure',
      reasonCode: 'REPEATED_STEP_UP_FAILURE',
      metadata: expect.objectContaining({ failureCount: 5, windowSeconds: 900 }),
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up_failure_threshold',
      reasonCode: 'REPEATED_STEP_UP_FAILURE',
    }));
    expect(JSON.stringify(securityEvents.append.mock.calls)).not.toContain('Wrong!AdminPassword2026');
  });

  it('issues a five-minute HttpOnly purpose-bound step-up cookie after password verification', async () => {
    const response = await createStepUp(post(
      'https://example.test/api/auth/step-up',
      { password: 'Current!AdminPassword2026', purpose: 'admin_password_reset' },
    ));

    expect(response.status).toBe(200);
    expect(stepUpStore.issue).toHaveBeenCalledWith(expect.objectContaining({
      userId: admin.userId,
      tokenVersion: admin.tokenVersion,
      purpose: 'admin_password_reset',
      ttlSeconds: 300,
    }));
    const cookie = response.headers.get('set-cookie') || '';
    expect(cookie).toContain('auth_step_up=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=strict');
    expect(cookie).toContain('Max-Age=300');
    expect(JSON.stringify(stepUpStore.issue.mock.calls)).not.toContain('Current!AdminPassword2026');
  });

  it('audits and alerts when the Redis step-up store is unavailable', async () => {
    stepUpStore.issue.mockRejectedValue(new Error('redis connection refused'));

    const response = await createStepUp(post(
      'https://example.test/api/auth/step-up',
      { password: 'Current!AdminPassword2026', purpose: 'admin_password_reset' },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_SECURITY_UNAVAILABLE' });
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'auth_security_subsystem_failure',
      reasonCode: 'STEP_UP_STORE_UNAVAILABLE',
      metadata: { component: 'redis_step_up_store' },
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'auth_security_subsystem_failure',
      reasonCode: 'STEP_UP_STORE_UNAVAILABLE',
    }));
    expect(JSON.stringify(securityEvents.append.mock.calls)).not.toContain('redis connection refused');
  });

  it('rejects a reset when step-up evidence is missing', async () => {
    const response = await resetPassword(post(
      'https://example.test/api/admin/users/member-1/password-reset',
      { reason: 'Identity verified through support ticket' },
    ), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(users.resetPasswordWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up',
      outcome: 'failure',
      reasonCode: 'STEP_UP_REQUIRED',
    }));
  });

  it('audits and alerts an administrative self-reset attempt', async () => {
    const response = await resetPassword(post(
      'https://example.test/api/admin/users/admin-1/password-reset',
      { reason: 'Attempt to bypass self-service password change' },
      'auth_step_up=opaque-token',
    ), { params: Promise.resolve({ id: admin.userId }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'SELF_RESET_FORBIDDEN' });
    expect(users.resetPasswordWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_password_reset',
      actorUserId: admin.userId,
      targetUserId: admin.userId,
      outcome: 'failure',
      reasonCode: 'SELF_RESET_FORBIDDEN',
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_password_reset',
      reasonCode: 'SELF_RESET_FORBIDDEN',
    }));
  });

  it.each([
    ['STEP_UP_EXPIRED'],
    ['STEP_UP_PURPOSE_MISMATCH'],
    ['STEP_UP_CONTEXT_MISMATCH'],
  ])('rejects invalid step-up evidence with %s', async (reason) => {
    stepUpStore.consume.mockResolvedValue({ ok: false, reason });

    const response = await resetPassword(post(
      'https://example.test/api/admin/users/member-1/password-reset',
      { reason: 'Identity verified through support ticket' },
      'auth_step_up=opaque-token',
    ), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: reason });
    expect(users.resetPasswordWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up',
      outcome: 'failure',
      reasonCode: reason,
    }));
  });

  it('consumes step-up evidence once and rejects a replay', async () => {
    stepUpStore.consume
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: 'STEP_UP_REUSED' });

    const request = () => post(
      'https://example.test/api/admin/users/member-1/password-reset',
      { reason: 'Identity verified through support ticket' },
      'auth_step_up=opaque-token',
    );
    const first = await resetPassword(request(), context);
    const second = await resetPassword(request(), context);

    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
    await expect(second.json()).resolves.toMatchObject({ code: 'STEP_UP_REUSED' });
    expect(users.resetPasswordWithAudit).toHaveBeenCalledTimes(1);
  });

  it('returns a generated temporary password once without putting it in audit metadata', async () => {
    const response = await resetPassword(post(
      'https://example.test/api/admin/users/member-1/password-reset',
      { reason: 'Identity verified through support ticket' },
      'auth_step_up=opaque-token',
    ), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.temporaryPassword).toEqual(expect.any(String));
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    expect(users.resetPasswordWithAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: member.id,
      passwordHash: 'temporary-password-hash',
      changedBy: admin.userId,
      event: expect.objectContaining({
        eventType: 'admin_password_reset',
        actorUserId: admin.userId,
        targetUserId: member.id,
        metadata: expect.objectContaining({ reason: 'Identity verified through support ticket' }),
      }),
    }));
    expect(JSON.stringify(users.resetPasswordWithAudit.mock.calls)).not.toContain(body.temporaryPassword);
  });

  it('does not let an ordinary admin reset a privileged account', async () => {
    users.findById.mockImplementation(async (id: string) => (
      id === admin.userId
        ? { ...admin, id: admin.userId, password_hash: 'admin-password-hash', status: 'active' }
        : { ...member, role: 'admin' }
    ));

    const response = await resetPassword(post(
      'https://example.test/api/admin/users/member-1/password-reset',
      { reason: 'Identity verified through support ticket' },
      'auth_step_up=opaque-token',
    ), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'SUPERADMIN_REQUIRED' });
    expect(users.resetPasswordWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failure',
      reasonCode: 'SUPERADMIN_REQUIRED',
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_password_reset',
      outcome: 'failure',
      reasonCode: 'SUPERADMIN_REQUIRED',
    }));
  });

  it('alerts after a superadmin resets a privileged account without including the temporary password', async () => {
    guards.requireAdmin.mockResolvedValue({ ...admin, userId: 'owner-1', role: 'superadmin' });
    users.findById.mockResolvedValue({ ...member, role: 'admin' });

    const response = await resetPassword(post(
      'https://example.test/api/admin/users/member-1/password-reset',
      { reason: 'Privileged credential recovery approved' },
      'auth_step_up=opaque-token',
    ), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_password_reset',
      targetUserId: member.id,
      outcome: 'success',
    }));
    expect(JSON.stringify(alerts.sendSecurityAlert.mock.calls)).not.toContain(body.temporaryPassword);
  });
});
