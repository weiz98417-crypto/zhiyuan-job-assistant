import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({
  comparePassword: vi.fn(),
  signToken: vi.fn(),
}));
const users = vi.hoisted(() => ({
  findByUsername: vi.fn(),
  countActiveAdmins: vi.fn(),
  updateLastLogin: vi.fn(),
  activateFirstAdmin: vi.fn(),
}));
const securityEvents = vi.hoisted(() => ({ append: vi.fn() }));

vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ assertReady: vi.fn(), users, securityEvents }),
}));

import { POST as login } from '@/app/api/auth/login/route';
import { middleware } from '@/middleware';

describe('forced password replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.comparePassword.mockResolvedValue(true);
    auth.signToken.mockResolvedValue('restricted-jwt');
    users.findByUsername.mockResolvedValue({
      id: 'member-1',
      username: 'memberone',
      display_name: 'Member One',
      password_hash: 'temporary-hash',
      role: 'member',
      status: 'active',
      token_version: 8,
      must_change_password: 1,
    });
  });

  it('marks a login session as restricted when a temporary password must be replaced', async () => {
    const response = await login(new NextRequest('https://example.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'memberone', password: 'Temporary!Password2026' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ mustChangePassword: true });
    expect(auth.signToken).toHaveBeenCalledWith(expect.objectContaining({
      mustChangePassword: true,
    }));
  });

  it('redirects a restricted browser session away from product pages', async () => {
    const secret = new TextEncoder().encode('dev-secret-change-in-production-min-32-chars!!');
    const token = await new SignJWT({
      userId: 'member-1',
      username: 'memberone',
      role: 'member',
      tokenVersion: 8,
      mustChangePassword: true,
    }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);

    const response = await middleware(new NextRequest('http://localhost/profile', {
      headers: { cookie: `auth_token=${token}` },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/change-password');
  });
});
