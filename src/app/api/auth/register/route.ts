import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/server-db';
import { hashPassword } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { username, password, displayName, email } = await request.json();

    if (!username || !password || !displayName) {
      return NextResponse.json(
        { error: '用户名、密码和显示名不能为空' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check uniqueness
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username);
    if (existing) {
      return NextResponse.json(
        { error: '用户名已存在' },
        { status: 409 }
      );
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // Auto-approve logic
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
    const autoApprove = process.env.AUTO_APPROVE === 'true';
    const isFirstUser = userCount === 0;
    const role = (isFirstUser || autoApprove) ? 'admin' : 'member';
    const status = (isFirstUser || autoApprove) ? 'active' : 'pending';

    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, email, role, status, token_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, username, passwordHash, displayName, email || '', role, status);

    if (isFirstUser) {
      return NextResponse.json({ message: '注册成功！你是第一位用户，已自动设为管理员，请登录。' });
    }

    return NextResponse.json({
      message: '注册成功，等待管理员审批',
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
}
