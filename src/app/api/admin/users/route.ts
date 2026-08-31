import { NextRequest, NextResponse } from 'next/server';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAdmin } from '@/lib/security/auth-guards';
import { safeUserDisplayName } from '@/lib/user-display-name';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const includeSummary = searchParams.get('includeSummary') === '1';

    const repos = getDataRepositories();
    const normalizedStatus = status && ['pending', 'active', 'rejected'].includes(status)
      ? status
      : undefined;
    const users = await repos.users.list(normalizedStatus);
    const allUsers = includeSummary && normalizedStatus
      ? await repos.users.list()
      : users;
    const recoveryRequests = actor.role === 'superadmin'
      ? await repos.passwordRecoveryRequests.listPending()
      : [];
    const recoveryByUserId = new Map(
      recoveryRequests.map((recovery) => [recovery.userId, recovery]),
    );

    const response = {
      users: users.map((u) => {
        const recovery = recoveryByUserId.get(u.id);
        return {
          id: u.id,
          username: u.username,
          displayName: safeUserDisplayName(u.display_name, u.username),
          email: u.email,
          role: u.role,
          status: u.status,
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at,
          ...(recovery ? {
            passwordRecovery: {
              id: recovery.id,
              requestedAt: recovery.requestedAt,
            },
          } : {}),
        };
      }),
      ...(includeSummary ? {
        summary: {
          all: allUsers.length,
          pending: allUsers.filter((user) => user.status === 'pending').length,
          active: allUsers.filter((user) => user.status === 'active').length,
          rejected: allUsers.filter((user) => user.status === 'rejected').length,
        },
      } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const authError = err as { status?: unknown; code?: unknown; message?: unknown };
    if (authError.status === 401 || authError.status === 403) {
      return NextResponse.json(
        {
          error: typeof authError.message === 'string' ? authError.message : 'Unauthorized',
          code: typeof authError.code === 'string' ? authError.code : 'UNAUTHORIZED',
        },
        { status: authError.status },
      );
    }
    console.error('[admin/users]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
