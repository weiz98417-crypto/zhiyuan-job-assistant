import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { hashPassword } from '@/lib/auth';
import { getDataRepositories } from '@/lib/data-repositories';

export async function POST(request: NextRequest) {
  try {
    const { username, password, displayName, email } = await request.json();

    if (!username || !password || !displayName) {
      return NextResponse.json({ error: '用户名、密码和显示名不能为空' }, { status: 400 });
    }

    const normalizedUsername = String(username).trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{3,19}$/.test(normalizedUsername)) {
      return NextResponse.json({ error: '用户名需以字母开头，长度 4-20 位' }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    }

    const repos = getDataRepositories();
    await repos.assertReady();

    const existing = await repos.users.findByUsername(normalizedUsername);
    if (existing) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    const activeAdminCount = await repos.users.countActiveAdmins();
    const isFirstAdmin = activeAdminCount === 0;

    await repos.users.create({
      id: crypto.randomUUID(),
      username: normalizedUsername,
      passwordHash: await hashPassword(String(password)),
      displayName: String(displayName).trim(),
      email: String(email || '').trim(),
      role: isFirstAdmin ? 'admin' : 'member',
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
