import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { hashPassword } from '@/lib/auth';
import { getDataRepositories } from '@/lib/data-repositories';
import { validatePassword } from '@/lib/security/password-policy';

export async function POST(request: NextRequest) {
  try {
    const { username, password, displayName, email } = await request.json();

    if (!username || !password || !displayName) {
      return NextResponse.json({ error: '用户名、密码和显示名不能为空' }, { status: 400 });
    }

    const normalizedUsername = String(username).trim();
    const normalizedEmail = String(email || '').trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{3,19}$/.test(normalizedUsername)) {
      return NextResponse.json({ error: '用户名需以字母开头，长度 4-20 位' }, { status: 400 });
    }
    const rawPassword = String(password);
    const passwordPolicy = validatePassword(rawPassword, {
      username: normalizedUsername,
      email: normalizedEmail,
    });
    if (!passwordPolicy.ok) {
      return NextResponse.json(
        { error: passwordPolicy.message, code: passwordPolicy.code },
        { status: 400 },
      );
    }

    const repos = getDataRepositories();
    await repos.assertReady();

    const existing = await repos.users.findByUsername(normalizedUsername);
    if (existing) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    const activeAdminCount = await repos.users.countActiveAdmins();
    const isFirstAdmin = activeAdminCount === 0;

    if (isFirstAdmin) {
      const adminPasswordPolicy = validatePassword(rawPassword, {
        username: normalizedUsername,
        email: normalizedEmail,
        role: 'superadmin',
      });
      if (!adminPasswordPolicy.ok) {
        return NextResponse.json(
          { error: adminPasswordPolicy.message, code: adminPasswordPolicy.code },
          { status: 400 },
        );
      }
    }

    await repos.users.create({
      id: crypto.randomUUID(),
      username: normalizedUsername,
      passwordHash: await hashPassword(rawPassword),
      displayName: String(displayName).trim(),
      email: normalizedEmail,
      role: isFirstAdmin ? 'superadmin' : 'member',
      status: isFirstAdmin ? 'active' : 'pending',
    });

    return NextResponse.json({
      message: isFirstAdmin ? '注册成功！你是第一位管理员，请登录。' : '注册成功，等待管理员审批',
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
