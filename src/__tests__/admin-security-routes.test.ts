import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  verifyTokenVersion: vi.fn(),
  hashPassword: vi.fn(),
}));
const guards = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
const stepUpStore = vi.hoisted(() => ({ consume: vi.fn() }));
const stepUpFailures = vi.hoisted(() => ({ recordFailure: vi.fn() }));
const alerts = vi.hoisted(() => ({ sendSecurityAlert: vi.fn() }));
const securityEvents = vi.hoisted(() => ({ append: vi.fn() }));
const users = vi.hoisted(() => ({
  list: vi.fn(),
  findById: vi.fn(),
  updateRole: vi.fn(),
  updateRoleWithAudit: vi.fn(),
  updateStatus: vi.fn(),
  updateStatusWithAudit: vi.fn(),
  resetPassword: vi.fn(),
  deleteWithAudit: vi.fn(),
  deleteCascade: vi.fn(),
}));

vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/security/auth-guards', () => guards);
vi.mock('@/lib/security/step-up-store', () => ({
  getStepUpStore: () => stepUpStore,
}));
vi.mock('@/lib/security/step-up-failure-tracker', () => ({
  getStepUpFailureTracker: () => stepUpFailures,
}));
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ users, securityEvents }),
}));
vi.mock('@/lib/security/security-alerts', () => alerts);

import { DELETE, POST, PUT } from '@/app/api/admin/users/[id]/route';
import { GET as listUsers } from '@/app/api/admin/users/route';

function updateRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/users/member-1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'member-1' }) };

describe('administrative user security boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const admin = {
      userId: 'admin-1', username: 'admin', role: 'admin', tokenVersion: 1,
    };
    auth.getCurrentUser.mockResolvedValue(admin);
    guards.requireAdmin.mockResolvedValue(admin);
    users.findById.mockResolvedValue({
      id: 'member-1', username: 'member', role: 'member', status: 'active',
    });
    stepUpStore.consume.mockResolvedValue({ ok: true });
    stepUpFailures.recordFailure.mockResolvedValue({
      count: 1,
      ttlSeconds: 900,
      shouldAlert: false,
    });
  });

  it('does not let an admin change user roles', async () => {
    const response = await PUT(updateRequest({ role: 'admin' }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUPERADMIN_REQUIRED',
    });
    expect(users.updateRole).not.toHaveBeenCalled();
    expect(users.updateRoleWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'role_change',
      outcome: 'failure',
      reasonCode: 'SUPERADMIN_REQUIRED',
    }));
  });

  it('does not let an admin reject a privileged account', async () => {
    users.findById.mockResolvedValue({
      id: 'member-1', username: 'owner', role: 'superadmin', status: 'active',
    });

    const response = await PUT(updateRequest({ status: 'rejected' }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUPERADMIN_REQUIRED',
    });
    expect(users.updateStatus).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'status_change',
      outcome: 'failure',
      reasonCode: 'SUPERADMIN_REQUIRED',
    }));
  });

  it('does not let an admin delete a privileged account', async () => {
    users.findById.mockResolvedValue({
      id: 'member-1', username: 'another-admin', role: 'admin', status: 'active',
    });

    const response = await DELETE(updateRequest({}), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUPERADMIN_REQUIRED',
    });
    expect(users.deleteWithAudit).not.toHaveBeenCalled();
    expect(users.deleteCascade).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_delete',
      outcome: 'failure',
      reasonCode: 'SUPERADMIN_REQUIRED',
    }));
  });

  it('audits and alerts a superadmin self-role-change attempt', async () => {
    const superadmin = {
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    };
    guards.requireAdmin.mockResolvedValue(superadmin);
    users.findById.mockResolvedValue({
      id: 'owner-1', username: 'owner', role: 'superadmin', status: 'active',
    });

    const response = await PUT(
      updateRequest({ role: 'admin' }),
      { params: Promise.resolve({ id: 'owner-1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'SELF_ROLE_CHANGE_FORBIDDEN' });
    expect(users.updateRoleWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'role_change',
      actorUserId: 'owner-1',
      targetUserId: 'owner-1',
      outcome: 'failure',
      reasonCode: 'SELF_ROLE_CHANGE_FORBIDDEN',
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'role_change',
      reasonCode: 'SELF_ROLE_CHANGE_FORBIDDEN',
    }));
  });

  it('audits and alerts a superadmin self-status-change attempt', async () => {
    const superadmin = {
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    };
    guards.requireAdmin.mockResolvedValue(superadmin);
    users.findById.mockResolvedValue({
      id: 'owner-1', username: 'owner', role: 'superadmin', status: 'active',
    });

    const response = await PUT(
      updateRequest({ status: 'rejected' }),
      { params: Promise.resolve({ id: 'owner-1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'SELF_STATUS_CHANGE_FORBIDDEN' });
    expect(users.updateStatusWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'status_change',
      actorUserId: 'owner-1',
      targetUserId: 'owner-1',
      outcome: 'failure',
      reasonCode: 'SELF_STATUS_CHANGE_FORBIDDEN',
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'status_change',
      reasonCode: 'SELF_STATUS_CHANGE_FORBIDDEN',
    }));
  });

  it('audits and alerts a superadmin self-delete attempt', async () => {
    const superadmin = {
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    };
    guards.requireAdmin.mockResolvedValue(superadmin);

    const response = await DELETE(
      updateRequest({}),
      { params: Promise.resolve({ id: 'owner-1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'SELF_DELETE_FORBIDDEN' });
    expect(users.deleteWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_delete',
      actorUserId: 'owner-1',
      targetUserId: 'owner-1',
      outcome: 'failure',
      reasonCode: 'SELF_DELETE_FORBIDDEN',
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_delete',
      reasonCode: 'SELF_DELETE_FORBIDDEN',
    }));
  });

  it('lets a superadmin read the administrative user list', async () => {
    const superadmin = {
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    };
    auth.getCurrentUser.mockResolvedValue(superadmin);
    guards.requireAdmin.mockResolvedValue(superadmin);
    users.list.mockResolvedValue([]);

    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ users: [] });
  });

  it('requires recent purpose-bound step-up before a superadmin changes a role', async () => {
    guards.requireAdmin.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    });

    const response = await PUT(updateRequest({ role: 'admin', reason: 'Team administration' }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(users.updateRoleWithAudit).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up',
      reasonCode: 'STEP_UP_REQUIRED',
      metadata: { purpose: 'admin_user_management' },
    }));
  });

  it('audits mismatched user-management step-up evidence', async () => {
    guards.requireAdmin.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    });
    stepUpStore.consume.mockResolvedValue({ ok: false, reason: 'STEP_UP_CONTEXT_MISMATCH' });
    const request = new NextRequest('http://localhost/api/admin/users/member-1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: 'auth_step_up=opaque-token',
      },
      body: JSON.stringify({ role: 'admin', reason: 'Team administration' }),
    });

    const response = await PUT(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'STEP_UP_CONTEXT_MISMATCH' });
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'step_up',
      reasonCode: 'STEP_UP_CONTEXT_MISMATCH',
    }));
  });

  it('consumes step-up and applies a superadmin role change atomically', async () => {
    guards.requireAdmin.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    });
    users.updateRoleWithAudit.mockResolvedValue({
      ok: true,
      user: { id: 'member-1', username: 'member', role: 'admin', status: 'active' },
    });
    users.findById
      .mockResolvedValueOnce({ id: 'member-1', username: 'member', role: 'member', status: 'active' })
      .mockResolvedValueOnce({ id: 'member-1', username: 'member', role: 'admin', status: 'active' });
    const request = new NextRequest('http://localhost/api/admin/users/member-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: 'auth_step_up=opaque-token' },
      body: JSON.stringify({ role: 'admin', reason: 'Team administration' }),
    });

    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    expect(stepUpStore.consume).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'admin_user_management',
      userId: 'owner-1',
      rawToken: 'opaque-token',
    }));
    expect(users.updateRoleWithAudit).toHaveBeenCalledTimes(1);
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'role_change',
      actorUserId: 'owner-1',
      targetUserId: 'member-1',
      outcome: 'success',
    }));
  });

  it('alerts after a superadmin deactivates a privileged account', async () => {
    guards.requireAdmin.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    });
    users.findById
      .mockResolvedValueOnce({ id: 'member-1', username: 'admin-two', role: 'admin', status: 'active' })
      .mockResolvedValueOnce({ id: 'member-1', username: 'admin-two', role: 'admin', status: 'rejected' });
    users.updateStatusWithAudit.mockResolvedValue({
      ok: true,
      user: { id: 'member-1', username: 'admin-two', role: 'admin', status: 'rejected' },
    });
    const request = new NextRequest('http://localhost/api/admin/users/member-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: 'auth_step_up=opaque-token' },
      body: JSON.stringify({ status: 'rejected', reason: 'Access review completed' }),
    });

    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'status_change',
      targetUserId: 'member-1',
      outcome: 'success',
    }));
  });

  it('alerts after a superadmin deletes a privileged account', async () => {
    guards.requireAdmin.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 2,
    });
    users.findById.mockResolvedValue({
      id: 'member-1', username: 'admin-two', role: 'admin', status: 'active',
    });
    users.deleteWithAudit.mockResolvedValue({ ok: true, username: 'admin-two' });
    const request = new NextRequest('http://localhost/api/admin/users/member-1', {
      method: 'DELETE',
      headers: { cookie: 'auth_step_up=opaque-token' },
    });

    const response = await DELETE(request, context);

    expect(response.status).toBe(200);
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_delete',
      targetUserId: 'member-1',
      outcome: 'success',
    }));
  });

  it('keeps the legacy arbitrary-password reset route disabled', async () => {
    const response = await POST(updateRequest({ password: 'UnsafeChosenPassword' }), context);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: 'LEGACY_PASSWORD_RESET_DISABLED',
    });
    expect(users.resetPassword).not.toHaveBeenCalled();
  });
});
