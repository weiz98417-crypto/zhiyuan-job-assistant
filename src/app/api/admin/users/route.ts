import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/server-db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const db = getDb();
    let sql = 'SELECT * FROM users ORDER BY created_at DESC';
    const params: string[] = [];

    if (status && ['pending', 'active', 'rejected'].includes(status)) {
      sql = 'SELECT * FROM users WHERE status = ? ORDER BY created_at DESC';
      params.push(status);
    }

    const users = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

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
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/users]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
