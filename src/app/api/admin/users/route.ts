import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, verifyTokenVersion } from '@/lib/auth';
import { getDataRepositories } from '@/lib/data-repositories';

export async function GET(request: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await verifyTokenVersion(payload);

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
    if (
      (err as Error).message === 'Not authenticated' ||
      (err as Error).message === 'Invalid or expired token' ||
      (err as Error).message === 'Token has been revoked'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/users]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
