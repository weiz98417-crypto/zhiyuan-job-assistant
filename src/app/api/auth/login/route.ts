import { NextRequest, NextResponse } from 'next/server';
import { comparePassword, signToken } from '@/lib/auth';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { getDataRepositories } from '@/lib/data-repositories';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const repos = getDataRepositories();
    await repos.assertReady();

    const user = await repos.users.findByUsername(String(username).trim());
    if (!user) {
      return NextResponse.json({ error: '用户名不存在' }, { status: 401 });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }

    let activeUser = user;
    if (user.status !== 'active') {
      const activeAdminCount = await repos.users.countActiveAdmins();
      if (activeAdminCount === 0) {
        await repos.users.activateFirstAdmin(user.id);
        activeUser = { ...user, role: 'admin', status: 'active' };
      } else {
        return NextResponse.json(
          {
            error: user.status === 'pending'
              ? '账户尚未通过审批，请联系管理员'
              : '账户已被拒绝，无法登录',
          },
          { status: 403 },
        );
      }
    }

    await repos.users.updateLastLogin(activeUser.id);

    const token = await signToken({
      id: activeUser.id,
      username: activeUser.username,
      role: activeUser.role,
      tokenVersion: activeUser.token_version,
    });

    const response = NextResponse.json({
      user: {
        id: activeUser.id,
        username: activeUser.username,
        displayName: activeUser.display_name,
        role: activeUser.role,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (err) {
    console.error('[auth/login]', err);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
