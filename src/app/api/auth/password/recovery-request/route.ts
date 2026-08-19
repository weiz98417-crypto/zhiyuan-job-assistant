import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDataRepositories } from '@/lib/data-repositories';
import {
  getPasswordRecoveryRateLimiter,
  PasswordRecoveryRateLimitUnavailableError,
} from '@/lib/security/password-recovery-rate-limit';
import { getTrustedSourceIp } from '@/lib/security/request-identity';

const ACCEPTED_RESPONSE = {
  code: 'RECOVERY_REQUEST_ACCEPTED',
  message: '如账户有效，密码找回申请已提交。请联系管理员完成身份核验。',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const account = typeof body.account === 'string' ? body.account.trim() : '';
    if (account.length < 2 || account.length > 320) {
      return NextResponse.json(
        { error: '请输入有效的用户名或邮箱', code: 'RECOVERY_ACCOUNT_REQUIRED' },
        { status: 400 },
      );
    }

    const sourceIp = getTrustedSourceIp(request) || 'unknown';
    const limit = await getPasswordRecoveryRateLimiter().consume({ account, sourceIp });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', code: 'RECOVERY_RATE_LIMITED' },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        },
      );
    }

    const repos = getDataRepositories();
    await repos.assertReady();
    const user = await repos.users.findByUsernameOrEmail(account);
    if (user?.status === 'active') {
      const requestId = crypto.randomUUID();
      await repos.passwordRecoveryRequests.submitForUser({
        id: crypto.randomUUID(),
        userId: user.id,
        sourceIp,
        userAgent: request.headers.get('user-agent') || undefined,
        event: {
          id: crypto.randomUUID(),
          eventType: 'password_recovery_request',
          targetUserId: user.id,
          outcome: 'pending',
          requestId,
          sourceIp,
          userAgent: request.headers.get('user-agent') || undefined,
          metadata: {},
        },
      });
    }

    return NextResponse.json(ACCEPTED_RESPONSE, { status: 202 });
  } catch (error) {
    if (error instanceof PasswordRecoveryRateLimitUnavailableError) {
      return NextResponse.json(
        {
          error: '认证安全服务暂时不可用，请稍后重试',
          code: 'AUTH_SECURITY_UNAVAILABLE',
        },
        { status: 503 },
      );
    }
    console.error('[auth/password/recovery-request]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
