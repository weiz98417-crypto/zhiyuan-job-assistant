import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { comparePassword, signToken } from '@/lib/auth';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { getDataRepositories } from '@/lib/data-repositories';
import {
  getLoginRateLimiter,
  LoginRateLimitUnavailableError,
} from '@/lib/security/login-rate-limit';
import { getTrustedSourceIp } from '@/lib/security/request-identity';
import { recordAuthSecuritySubsystemFailure } from '@/lib/security/auth-security-monitor';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json(
        { error: '用户名和密码不能为空', code: 'LOGIN_FIELDS_REQUIRED' },
        { status: 400 },
      );
    }

    const normalizedUsername = String(username).trim();
    const sourceIp = getTrustedSourceIp(request);
    const loginIdentity = { account: normalizedUsername, sourceIp };
    const limiter = getLoginRateLimiter();
    const limit = await limiter.beforeAttempt(loginIdentity);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', code: limit.reason },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        },
      );
    }

    const repos = getDataRepositories();
    await repos.assertReady();
    const user = await repos.users.findByUsername(normalizedUsername);
    if (!user) {
      await limiter.recordFailure(loginIdentity);
      await repos.securityEvents.append({
        id: crypto.randomUUID(),
        eventType: 'login',
        outcome: 'failure',
        reasonCode: 'INVALID_CREDENTIALS',
        requestId: crypto.randomUUID(),
        sourceIp,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { accountKnown: false },
      });
      return NextResponse.json(
        { error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      );
    }

    const valid = await comparePassword(String(password), user.password_hash);
    if (!valid) {
      await limiter.recordFailure(loginIdentity);
      await repos.securityEvents.append({
        id: crypto.randomUUID(),
        eventType: 'login',
        actorUserId: user.id,
        targetUserId: user.id,
        actorRole: user.role,
        outcome: 'failure',
        reasonCode: 'INVALID_CREDENTIALS',
        requestId: crypto.randomUUID(),
        sourceIp,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { accountKnown: true },
      });
      return NextResponse.json(
        { error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      );
    }

    let activeUser = user;
    if (user.status !== 'active') {
      const activeAdminCount = await repos.users.countActiveAdmins();
      if (activeAdminCount === 0) {
        await repos.users.activateFirstAdmin(user.id);
        activeUser = { ...user, role: 'superadmin', status: 'active' };
      } else {
        return NextResponse.json(
          {
            error: user.status === 'pending'
              ? '账户尚未通过审批，请联系管理员'
              : '账户已被拒绝，无法登录',
            code: 'ACCOUNT_NOT_ACTIVE',
          },
          { status: 403 },
        );
      }
    }

    await repos.users.updateLastLogin(activeUser.id);
    await limiter.recordSuccess(loginIdentity);
    await repos.securityEvents.append({
      id: crypto.randomUUID(),
      eventType: 'login',
      actorUserId: activeUser.id,
      targetUserId: activeUser.id,
      actorRole: activeUser.role,
      outcome: 'success',
      requestId: crypto.randomUUID(),
      sourceIp,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {},
    });

    const mustChangePassword = Boolean(activeUser.must_change_password);
    const token = await signToken({
      id: activeUser.id,
      username: activeUser.username,
      role: activeUser.role,
      tokenVersion: activeUser.token_version,
      mustChangePassword,
    });

    const response = NextResponse.json({
      user: {
        id: activeUser.id,
        username: activeUser.username,
        displayName: activeUser.display_name,
        role: activeUser.role,
      },
      mustChangePassword,
    });
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    if (error instanceof LoginRateLimitUnavailableError) {
      await recordAuthSecuritySubsystemFailure({
        request,
        component: 'redis_login_rate_limiter',
        reasonCode: 'LOGIN_SECURITY_UNAVAILABLE',
      });
      return NextResponse.json(
        { error: '登录安全服务暂不可用', code: 'LOGIN_SECURITY_UNAVAILABLE' },
        { status: 503 },
      );
    }
    console.error('[auth/login]', error);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
