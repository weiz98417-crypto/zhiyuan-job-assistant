import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const users = vi.hoisted(() => ({
  findByUsername: vi.fn(),
  findById: vi.fn(),
  countActiveAdmins: vi.fn(),
  create: vi.fn(),
  changeOwnPassword: vi.fn(),
}));

const assertReady = vi.hoisted(() => vi.fn());
const securityEvents = vi.hoisted(() => ({ append: vi.fn() }));
const auth = vi.hoisted(() => ({
  comparePassword: vi.fn(),
  getCurrentUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyTokenVersion: vi.fn(),
}));
const alerts = vi.hoisted(() => ({ sendSecurityAlert: vi.fn() }));
const loginLimiter = vi.hoisted(() => ({
  beforeAttempt: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ assertReady, users, securityEvents }),
}));

vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/security/security-alerts', () => alerts);
vi.mock('@/lib/security/login-rate-limit', () => {
  class LoginRateLimitUnavailableError extends Error {}
  return {
    LoginRateLimitUnavailableError,
    getLoginRateLimiter: () => loginLimiter,
  };
});

import { POST as register } from '@/app/api/auth/register/route';
import { POST as changePassword } from '@/app/api/auth/password/change/route';
import { POST as login } from '@/app/api/auth/login/route';
import { LoginRateLimitUnavailableError } from '@/lib/security/login-rate-limit';

function registrationRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function passwordChangeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/password/change', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest',
    },
    body: JSON.stringify(body),
  });
}

function loginRequest(body: Record<string, unknown>) {
  return new NextRequest('https://example.test/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest',
      'x-real-ip': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login subsystem security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginLimiter.beforeAttempt.mockResolvedValue({ allowed: true });
  });

  it('audits and alerts when distributed login limiting is unavailable', async () => {
    loginLimiter.beforeAttempt.mockRejectedValue(
      new LoginRateLimitUnavailableError('redis connection refused'),
    );

    const response = await login(loginRequest({ username: 'admin', password: 'not-recorded' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'LOGIN_SECURITY_UNAVAILABLE' });
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'auth_security_subsystem_failure',
      reasonCode: 'LOGIN_SECURITY_UNAVAILABLE',
      metadata: { component: 'redis_login_rate_limiter' },
    }));
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'auth_security_subsystem_failure',
    }));
    expect(JSON.stringify(securityEvents.append.mock.calls)).not.toContain('not-recorded');
    expect(JSON.stringify(securityEvents.append.mock.calls)).not.toContain('redis connection refused');
  });
});

describe('POST /api/auth/register password security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.hashPassword.mockResolvedValue('new-password-hash');
    auth.hashPassword.mockResolvedValue('new-password-hash');
    users.findByUsername.mockResolvedValue(undefined);
    users.countActiveAdmins.mockResolvedValue(1);
  });

  it('rejects a common password before creating the account', async () => {
    const response = await register(registrationRequest({
      username: 'newmember',
      password: 'admin123',
      displayName: 'New Member',
      email: 'new@example.com',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_TOO_COMMON',
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects a password derived from the username', async () => {
    const response = await register(registrationRequest({
      username: 'newmember',
      password: 'newmember-2026-secure',
      displayName: 'New Member',
      email: 'new@example.com',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER',
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects a member password shorter than 12 characters', async () => {
    const response = await register(registrationRequest({
      username: 'newmember',
      password: 'Z9!aBc2#xY7',
      displayName: 'New Member',
      email: 'new@example.com',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('requires 16 characters when registration bootstraps the first administrator', async () => {
    users.countActiveAdmins.mockResolvedValue(0);

    const response = await register(registrationRequest({
      username: 'owneraccount',
      password: 'V7!mQ2#rT9@z',
      displayName: 'Owner',
      email: 'owner@example.com',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects passwords exceeding the bcrypt 72-byte input limit', async () => {
    const response = await register(registrationRequest({
      username: 'newmember',
      password: `${'A'.repeat(72)}!`,
      displayName: 'New Member',
      email: 'new@example.com',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_TOO_LONG_BYTES',
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects a password derived from the email account name', async () => {
    const response = await register(registrationRequest({
      username: 'differentname',
      password: 'newhire2026!Safe',
      displayName: 'New Member',
      email: 'newhire@example.com',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER',
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('bootstraps the first account as superadmin', async () => {
    users.countActiveAdmins.mockResolvedValue(0);

    const response = await register(registrationRequest({
      username: 'owneraccount',
      password: 'V7!mQ2#rT9@zL4$k',
      displayName: 'Owner',
      email: 'owner@example.com',
    }));

    expect(response.status).toBe(200);
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'superadmin',
      status: 'active',
    }));
  });
});

describe('POST /api/auth/password/change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentUser.mockResolvedValue({
      userId: 'user-1',
      username: 'memberone',
      role: 'member',
      tokenVersion: 3,
    });
    users.findById.mockResolvedValue({
      id: 'user-1',
      username: 'memberone',
      email: 'member@example.com',
      password_hash: 'current-password-hash',
      role: 'member',
      status: 'active',
      token_version: 3,
    });
  });

  it('rejects a wrong current password without changing durable credential state', async () => {
    auth.comparePassword.mockResolvedValue(false);

    const response = await changePassword(passwordChangeRequest({
      currentPassword: 'wrong-current-password',
      newPassword: 'Valid!Replacement2026',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CURRENT_PASSWORD_INVALID',
    });
    expect(users.changeOwnPassword).not.toHaveBeenCalled();
    expect(securityEvents.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'password_change',
      actorUserId: 'user-1',
      targetUserId: 'user-1',
      outcome: 'failure',
      reasonCode: 'CURRENT_PASSWORD_INVALID',
    }));
    expect(JSON.stringify(securityEvents.append.mock.calls)).not.toContain('wrong-current-password');
  });

  it('atomically changes the password, audits it, and clears the current session', async () => {
    auth.comparePassword.mockResolvedValue(true);
    users.changeOwnPassword.mockResolvedValue(true);

    const response = await changePassword(passwordChangeRequest({
      currentPassword: 'Correct!Current2025',
      newPassword: 'Strong!Replacement2026',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PASSWORD_CHANGED',
    });
    expect(users.changeOwnPassword).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      passwordHash: 'new-password-hash',
      event: expect.objectContaining({
        eventType: 'password_change',
        actorUserId: 'user-1',
        targetUserId: 'user-1',
        outcome: 'success',
      }),
    }));
    expect(securityEvents.append).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain('auth_token=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(JSON.stringify(users.changeOwnPassword.mock.calls)).not.toContain('Correct!Current2025');
    expect(JSON.stringify(users.changeOwnPassword.mock.calls)).not.toContain('Strong!Replacement2026');
  });

  it('alerts after a privileged user changes their own password', async () => {
    auth.getCurrentUser.mockResolvedValue({
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 3,
    });
    users.findById.mockResolvedValue({
      id: 'owner-1', username: 'owner', email: 'owner@example.com',
      password_hash: 'current-password-hash', role: 'superadmin', status: 'active', token_version: 3,
    });
    auth.comparePassword.mockResolvedValue(true);
    users.changeOwnPassword.mockResolvedValue(true);

    const response = await changePassword(passwordChangeRequest({
      currentPassword: 'Correct!OwnerPassword2025',
      newPassword: 'Strong!PrivilegedReplacement2026',
    }));

    expect(response.status).toBe(200);
    expect(alerts.sendSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'password_change', actorUserId: 'owner-1', outcome: 'success',
    }));
  });
});
