import { beforeEach, describe, expect, it, vi } from 'vitest';

const guards = vi.hoisted(() => ({ requireAuthenticated: vi.fn() }));
const users = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('@/lib/security/auth-guards', () => guards);
vi.mock('@/lib/data-repositories', () => ({
  getDataRepositories: () => ({ users }),
}));

import { GET } from '@/app/api/users/me/route';

describe('GET /api/users/me session validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a cryptographically valid token after its token version is revoked', async () => {
    guards.requireAuthenticated.mockRejectedValue({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Token has been revoked',
    });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('returns the current durable user only after session validation succeeds', async () => {
    guards.requireAuthenticated.mockResolvedValue({
      userId: 'owner-1',
      username: 'owner',
      role: 'superadmin',
      tokenVersion: 4,
      mustChangePassword: false,
    });
    users.findById.mockResolvedValue({
      id: 'owner-1',
      username: 'owner',
      display_name: 'Owner',
      email: 'owner@example.com',
      role: 'superadmin',
      status: 'active',
      token_version: 4,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(users.findById).toHaveBeenCalledWith('owner-1');
    await expect(response.json()).resolves.toMatchObject({
      id: 'owner-1',
      role: 'superadmin',
      tokenVersion: 4,
    });
  });
});
