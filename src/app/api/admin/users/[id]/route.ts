import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, verifyTokenVersion, hashPassword } from '@/lib/auth';
import { getDataRepositories } from '@/lib/data-repositories';

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== 'admin') {
    throw new Error('Forbidden');
  }
  // Verify token_version before write operations
  await verifyTokenVersion(payload);
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
    const repos = getDataRepositories();
    const user = await repos.users.findById(id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (body.status) {
      // Approve or reject
      await repos.users.updateStatus(id, body.status, payload.userId);
    }

    if (body.role) {
      await repos.users.updateRole(id, body.role);
    }

    const updated = await repos.users.findById(id) as Record<string, unknown>;
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

    const passwordHash = await hashPassword(newPassword);

    await getDataRepositories().users.resetPassword(id, passwordHash);

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

    const repos = getDataRepositories();
    const user = await repos.users.findById(id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    await repos.users.deleteCascade(id);

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
