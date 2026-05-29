import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/server-db';
import { getCurrentUser, verifyTokenVersion, hashPassword } from '@/lib/auth';

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== 'admin') {
    throw new Error('Forbidden');
  }
  // Verify token_version before write operations
  verifyTokenVersion(payload);
  return payload;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await ensureAdmin();
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (body.status) {
      // Approve or reject
      db.prepare(`
        UPDATE users SET status = ?, token_version = token_version + 1,
        approved_at = datetime('now'), approved_by = ?
        WHERE id = ?
      `).run(body.status, payload.userId, id);
    }

    if (body.role) {
      db.prepare(`
        UPDATE users SET role = ?, token_version = token_version + 1
        WHERE id = ?
      `).run(body.role, id);
    }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        createdAt: updated.created_at,
      },
    });
  } catch (err) {
    if ((err as Error).message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (
      (err as Error).message === 'Not authenticated' ||
      (err as Error).message === 'Invalid or expired token' ||
      (err as Error).message === 'Token has been revoked'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/users/[id]]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAdmin();
    const { id } = await params;
    const { newPassword } = await request.json();

    if (!newPassword) {
      return NextResponse.json({ error: '新密码不能为空' }, { status: 400 });
    }

    const db = getDb();
    const passwordHash = await hashPassword(newPassword);

    db.prepare(`
      UPDATE users SET password_hash = ?, token_version = token_version + 1
      WHERE id = ?
    `).run(passwordHash, id);

    return NextResponse.json({ message: '密码已重置' });
  } catch (err) {
    if ((err as Error).message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (
      (err as Error).message === 'Not authenticated' ||
      (err as Error).message === 'Invalid or expired token' ||
      (err as Error).message === 'Token has been revoked'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/users/[id] POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await ensureAdmin();
    const { id } = await params;

    // Cannot delete self
    if (id === payload.userId) {
      return NextResponse.json({ error: '不能删除自己的账户' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // Delete all associated data from private tables, then the user
    const privateTables = [
      'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
      'applications', 'agent_preferences', 'session_memory',
      'optimization_preferences', 'reports',
    ];
    const del = db.transaction(() => {
      for (const table of privateTables) {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    del();

    return NextResponse.json({ message: `用户 ${user.username} 已删除` });
  } catch (err) {
    if ((err as Error).message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (
      (err as Error).message === 'Not authenticated' ||
      (err as Error).message === 'Invalid or expired token' ||
      (err as Error).message === 'Token has been revoked'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/users/[id] DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
