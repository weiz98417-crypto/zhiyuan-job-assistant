import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/server-db';
import { comparePassword, signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const db = getDb();
    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as Record<string, unknown> | undefined;

    if (!user) {
      return NextResponse.json(
        { error: '用户名不存在' },
        { status: 401 }
      );
    }

    const valid = await comparePassword(
      password,
      user.password_hash as string
    );
    if (!valid) {
      return NextResponse.json(
        { error: '密码错误' },
        { status: 401 }
      );
    }

    // Auto-upgrade: if no active admin exists, upgrade this user to admin
    if (user.status !== 'active') {
      const activeAdminCount = (db.prepare(
        "SELECT COUNT(*) as cnt FROM users WHERE status = 'active' AND role = 'admin'"
      ).get() as { cnt: number }).cnt;

      if (activeAdminCount === 0 && valid) {
        // No admin — auto-upgrade this user
        db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(user.id);
        user.role = 'admin';
        user.status = 'active';
      } else {
        return NextResponse.json(
          {
            error:
              user.status === 'pending'
                ? '账户尚未通过审批，请联系管理员'
                : '账户已被拒绝，无法登录',
          },
          { status: 403 }
        );
      }
    }

    // Update last_login_at
    db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(
      user.id
    );

    const token = await signToken({
      id: user.id as string,
      username: user.username as string,
      role: user.role as string,
      tokenVersion: user.token_version as number,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err) {
    console.error('[auth/login]', err);
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}
