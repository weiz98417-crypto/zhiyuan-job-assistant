import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  comparePassword,
  getCurrentUser,
  hashPassword,
  verifyTokenVersion,
} from '@/lib/auth';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { getDataRepositories } from '@/lib/data-repositories';
import { validatePassword } from '@/lib/security/password-policy';
import { sendSecurityAlert } from '@/lib/security/security-alerts';

const AUTH_ERRORS = new Set([
  'Not authenticated',
  'Invalid or expired token',
  'Token has been revoked',
]);

export async function POST(request: NextRequest) {
  try {
    const payload = await getCurrentUser();
    await verifyTokenVersion(payload);

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: '当前密码和新密码不能为空', code: 'PASSWORD_FIELDS_REQUIRED' },
        { status: 400 },
      );
    }

    const repos = getDataRepositories();
    await repos.assertReady();
    const user = await repos.users.findById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestId = crypto.randomUUID();
    const currentPasswordMatches = await comparePassword(
      String(currentPassword),
      user.password_hash,
    );
    if (!currentPasswordMatches) {
      await repos.securityEvents.append({
        id: crypto.randomUUID(),
        eventType: 'password_change',
        actorUserId: payload.userId,
        targetUserId: payload.userId,
        actorRole: payload.role,
        outcome: 'failure',
        reasonCode: 'CURRENT_PASSWORD_INVALID',
        requestId,
        sourceIp: request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {},
      });
      return NextResponse.json(
        { error: '当前密码不正确', code: 'CURRENT_PASSWORD_INVALID' },
        { status: 400 },
      );
    }

    const nextPassword = String(newPassword);
    const passwordPolicy = validatePassword(nextPassword, {
      username: user.username,
      email: String(user.email || ''),
      role: user.role as 'member' | 'admin' | 'superadmin',
    });
    if (!passwordPolicy.ok) {
      return NextResponse.json(
        { error: passwordPolicy.message, code: passwordPolicy.code },
        { status: 400 },
      );
    }

    const auditEvent = {
      id: crypto.randomUUID(),
      eventType: 'password_change',
      actorUserId: payload.userId,
      targetUserId: payload.userId,
      actorRole: payload.role,
      outcome: 'success',
      requestId,
      sourceIp: request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {},
    };
    const changed = await repos.users.changeOwnPassword({
      userId: payload.userId,
      passwordHash: await hashPassword(nextPassword),
      changedBy: payload.userId,
      event: auditEvent,
    });
    if (!changed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (payload.role === 'admin' || payload.role === 'superadmin') {
      await sendSecurityAlert(auditEvent);
    }

    const response = NextResponse.json({
      message: '密码已修改，请重新登录',
      code: 'PASSWORD_CHANGED',
    });
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set('csrf_token', '', {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (AUTH_ERRORS.has((error as Error).message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth/password/change]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
