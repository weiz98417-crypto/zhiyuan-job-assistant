import { NextRequest, NextResponse } from 'next/server';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAdmin } from '@/lib/security/auth-guards';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const users = await getDataRepositories().users.list(
      status && ['pending', 'active', 'rejected'].includes(status) ? status : undefined,
    );

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
    });
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
