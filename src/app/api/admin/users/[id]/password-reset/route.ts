import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAdmin } from '@/lib/security/auth-guards';
import {
  getTrustedSourceIp,
  getUserAgentDigest,
} from '@/lib/security/request-identity';
import { getStepUpStore } from '@/lib/security/step-up-store';
import { sendSecurityAlert } from '@/lib/security/security-alerts';
import { recordFailedStepUp } from '@/lib/security/step-up-monitor';

function temporaryPassword(): string {
  return `Zy!${crypto.randomBytes(18).toString('base64url')}`;
}

async function recordDeniedPasswordReset(input: {
  request: NextRequest;
  actor: { userId: string; role: string };
  targetUserId: string;
  reasonCode: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const event = {
    id: crypto.randomUUID(),
    eventType: 'admin_password_reset',
    actorUserId: input.actor.userId,
    targetUserId: input.targetUserId,
    actorRole: input.actor.role,
    outcome: 'failure',
    reasonCode: input.reasonCode,
    requestId: crypto.randomUUID(),
    sourceIp: getTrustedSourceIp(input.request),
    userAgent: input.request.headers.get('user-agent') || undefined,
    metadata: input.metadata || {},
  };
  await getDataRepositories().securityEvents.append(event);
  await sendSecurityAlert(event);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const recoveryRequestId = typeof body.recoveryRequestId === 'string'
      ? body.recoveryRequestId.trim().slice(0, 100)
      : '';
    if (reason.length < 3) {
      return NextResponse.json(
        { error: 'A reset reason is required', code: 'RESET_REASON_REQUIRED' },
        { status: 400 },
      );
    }
    if (id === actor.userId) {
      await recordDeniedPasswordReset({
        request,
        actor,
        targetUserId: id,
        reasonCode: 'SELF_RESET_FORBIDDEN',
        metadata: { purpose: 'admin_password_reset' },
      });
      return NextResponse.json(
        { error: 'Use self-service password change', code: 'SELF_RESET_FORBIDDEN' },
        { status: 400 },
      );
    }
    if (recoveryRequestId && actor.role !== 'superadmin') {
      await recordDeniedPasswordReset({
        request,
        actor,
        targetUserId: id,
        reasonCode: 'SUPERADMIN_REQUIRED',
        metadata: { purpose: 'password_recovery_completion' },
      });
      return NextResponse.json(
        {
          error: 'Superadmin is required to complete password recovery',
          code: 'SUPERADMIN_REQUIRED',
        },
        { status: 403 },
      );
    }

    const repos = getDataRepositories();
    const target = await repos.users.findById(id);
    if (!target) {
      return NextResponse.json({ error: 'User not found', code: 'TARGET_NOT_FOUND' }, { status: 404 });
    }
    if (target.status !== 'active') {
      return NextResponse.json(
        { error: 'Only active accounts can be reset', code: 'TARGET_NOT_ACTIVE' },
        { status: 409 },
      );
    }
    if ((target.role === 'admin' || target.role === 'superadmin') && actor.role !== 'superadmin') {
      await recordDeniedPasswordReset({
        request,
        actor,
        targetUserId: id,
        reasonCode: 'SUPERADMIN_REQUIRED',
        metadata: { targetRole: target.role },
      });
      return NextResponse.json(
        { error: 'Superadmin is required for privileged accounts', code: 'SUPERADMIN_REQUIRED' },
        { status: 403 },
      );
    }

    const rawToken = request.cookies.get('auth_step_up')?.value;
    if (!rawToken) {
      await recordFailedStepUp({
        request,
        actor,
        purpose: 'admin_password_reset',
        reasonCode: 'STEP_UP_REQUIRED',
      });
      return NextResponse.json(
        { error: 'Recent authentication is required', code: 'STEP_UP_REQUIRED' },
        { status: 403 },
      );
    }
    const consumed = await getStepUpStore().consume({
      rawToken,
      userId: actor.userId,
      tokenVersion: actor.tokenVersion,
      purpose: 'admin_password_reset',
      sourceIp: getTrustedSourceIp(request),
      userAgentDigest: getUserAgentDigest(request),
    });
    if (!consumed.ok) {
      await recordFailedStepUp({
        request,
        actor,
        purpose: 'admin_password_reset',
        reasonCode: consumed.reason,
      });
      return NextResponse.json(
        { error: 'Step-up evidence is invalid or expired', code: consumed.reason },
        { status: 403 },
      );
    }

    const generatedPassword = temporaryPassword();
    const auditEvent = {
      id: crypto.randomUUID(),
      eventType: 'admin_password_reset',
      actorUserId: actor.userId,
      targetUserId: id,
      actorRole: actor.role,
      outcome: 'success',
      requestId: crypto.randomUUID(),
      sourceIp: getTrustedSourceIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        reason,
        targetRole: target.role,
        ...(recoveryRequestId ? { recoveryRequestId } : {}),
      },
    };
    const passwordHash = await hashPassword(generatedPassword);
    const reset = recoveryRequestId
      ? await repos.passwordRecoveryRequests.completeWithPasswordReset({
          requestId: recoveryRequestId,
          userId: id,
          passwordHash,
          changedBy: actor.userId,
          event: auditEvent,
        })
      : await repos.users.resetPasswordWithAudit({
          userId: id,
          passwordHash,
          changedBy: actor.userId,
          event: auditEvent,
        });
    if (!reset) {
      return recoveryRequestId
        ? NextResponse.json(
            { error: 'Recovery request is no longer pending', code: 'RECOVERY_REQUEST_INVALID' },
            { status: 409 },
          )
        : NextResponse.json(
            { error: 'User not found', code: 'TARGET_NOT_FOUND' },
            { status: 404 },
          );
    }
    if (recoveryRequestId || target.role === 'admin' || target.role === 'superadmin') {
      await sendSecurityAlert(auditEvent);
    }

    const response = NextResponse.json({
      code: 'PASSWORD_RESET',
      temporaryPassword: generatedPassword,
      mustChangePassword: true,
    });
    response.cookies.set('auth_step_up', '', {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
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
    console.error('[admin/users/password-reset]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
