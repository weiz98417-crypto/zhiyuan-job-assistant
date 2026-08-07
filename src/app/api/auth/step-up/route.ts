import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { comparePassword } from '@/lib/auth';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAdmin } from '@/lib/security/auth-guards';
import {
  getTrustedSourceIp,
  getUserAgentDigest,
} from '@/lib/security/request-identity';
import {
  getStepUpStore,
  STEP_UP_PURPOSES,
  type StepUpPurpose,
} from '@/lib/security/step-up-store';
import { recordFailedStepUp } from '@/lib/security/step-up-monitor';
import { recordAuthSecuritySubsystemFailure } from '@/lib/security/auth-security-monitor';

const STEP_UP_TTL_SECONDS = 300;

export async function POST(request: NextRequest) {
  let actorForFailure: { userId: string; role: string } | undefined;
  try {
    const actor = await requireAdmin();
    actorForFailure = actor;
    const body = await request.json();
    if (!body.password || !STEP_UP_PURPOSES.includes(body.purpose as StepUpPurpose)) {
      return NextResponse.json(
        { error: 'Password and a valid purpose are required', code: 'STEP_UP_FIELDS_REQUIRED' },
        { status: 400 },
      );
    }

    const repos = getDataRepositories();
    const user = await repos.users.findById(actor.userId);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!await comparePassword(String(body.password), user.password_hash)) {
      await recordFailedStepUp({
        request,
        actor,
        purpose: body.purpose,
        reasonCode: 'CURRENT_PASSWORD_INVALID',
      });
      return NextResponse.json(
        { error: 'Current password is incorrect', code: 'CURRENT_PASSWORD_INVALID' },
        { status: 401 },
      );
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    await getStepUpStore().issue({
      rawToken,
      userId: actor.userId,
      tokenVersion: actor.tokenVersion,
      purpose: body.purpose,
      sourceIp: getTrustedSourceIp(request),
      userAgentDigest: getUserAgentDigest(request),
      ttlSeconds: STEP_UP_TTL_SECONDS,
    });

    await repos.securityEvents.append({
      id: crypto.randomUUID(),
      eventType: 'step_up',
      actorUserId: actor.userId,
      targetUserId: actor.userId,
      actorRole: actor.role,
      outcome: 'success',
      requestId: crypto.randomUUID(),
      sourceIp: getTrustedSourceIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { purpose: body.purpose },
    });

    const response = NextResponse.json({ code: 'STEP_UP_VERIFIED', expiresIn: STEP_UP_TTL_SECONDS });
    response.cookies.set('auth_step_up', rawToken, {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'strict',
      path: '/',
      maxAge: STEP_UP_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    if (candidate.status === 401 || candidate.status === 403) {
      return NextResponse.json(
        { error: candidate.message, code: candidate.code },
        { status: candidate.status },
      );
    }
    await recordAuthSecuritySubsystemFailure({
      request,
      actor: actorForFailure,
      component: 'redis_step_up_store',
      reasonCode: 'STEP_UP_STORE_UNAVAILABLE',
    });
    console.error('[auth/step-up]', error);
    return NextResponse.json(
      { error: 'Authentication security subsystem unavailable', code: 'AUTH_SECURITY_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
