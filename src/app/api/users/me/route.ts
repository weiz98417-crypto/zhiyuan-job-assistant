import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server-db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const payload = await getCurrentUser();

    const db = getDb();
    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(payload.userId) as Record<string, unknown> | undefined;

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      status: user.status,
      tokenVersion: user.token_version,
    });
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
