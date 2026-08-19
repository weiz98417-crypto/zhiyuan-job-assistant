import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  verifyTokenVersion: vi.fn(),
}));

vi.mock('@/lib/auth', () => auth);

import {
  requireAdmin,
  requireSuperadmin,
} from '@/lib/security/auth-guards';

describe('central authentication guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['admin', 'superadmin'] as const)('allows %s through the admin boundary', async (role) => {
    const payload = { userId: 'actor-1', username: 'actor', role, tokenVersion: 2 };
    auth.getCurrentUser.mockResolvedValue(payload);

    await expect(requireAdmin()).resolves.toEqual(payload);
    expect(auth.verifyTokenVersion).toHaveBeenCalledWith(payload);
  });

  it('rejects a member at the admin boundary', async () => {
    auth.getCurrentUser.mockResolvedValue({
      userId: 'member-1', username: 'member', role: 'member', tokenVersion: 0,
    });

    await expect(requireAdmin()).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('allows only superadmin through the privileged boundary', async () => {
    auth.getCurrentUser.mockResolvedValue({
      userId: 'admin-1', username: 'admin', role: 'admin', tokenVersion: 1,
    });
    await expect(requireSuperadmin()).rejects.toMatchObject({
      status: 403,
      code: 'SUPERADMIN_REQUIRED',
    });

    const superadmin = {
      userId: 'owner-1', username: 'owner', role: 'superadmin', tokenVersion: 4,
    };
    auth.getCurrentUser.mockResolvedValue(superadmin);
    await expect(requireSuperadmin()).resolves.toEqual(superadmin);
  });
});
