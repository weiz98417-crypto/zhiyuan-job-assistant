import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getDataRepositories, type AuthSecurityEventInput } from '@/lib/data-repositories';
import { sendSecurityAlert } from '@/lib/security/security-alerts';
import { recordAuthSecuritySubsystemFailure } from '@/lib/security/auth-security-monitor';
import { getStepUpFailureTracker } from '@/lib/security/step-up-failure-tracker';
import type { StepUpPurpose } from '@/lib/security/step-up-store';
import { getTrustedSourceIp } from '@/lib/security/request-identity';

export type StepUpFailureReason =
  | 'CURRENT_PASSWORD_INVALID'
  | 'STEP_UP_REQUIRED'
  | 'STEP_UP_REUSED'
  | 'STEP_UP_EXPIRED'
  | 'STEP_UP_PURPOSE_MISMATCH'
  | 'STEP_UP_CONTEXT_MISMATCH';

interface FailedStepUpInput {
  request: NextRequest;
  actor: {
    userId: string;
    role: string;
  };
  purpose: StepUpPurpose;
  reasonCode: StepUpFailureReason;
}

export async function recordFailedStepUp(input: FailedStepUpInput): Promise<void> {
  const repos = getDataRepositories();
  const requestId = crypto.randomUUID();
  const sourceIp = getTrustedSourceIp(input.request);
  const baseEvent: AuthSecurityEventInput = {
    id: crypto.randomUUID(),
    eventType: 'step_up',
    actorUserId: input.actor.userId,
    targetUserId: input.actor.userId,
    actorRole: input.actor.role,
    outcome: 'failure',
    reasonCode: input.reasonCode,
    requestId,
    sourceIp,
    userAgent: input.request.headers.get('user-agent') || undefined,
    metadata: { purpose: input.purpose },
  };
  await repos.securityEvents.append(baseEvent);

  try {
    const failure = await getStepUpFailureTracker().recordFailure({
      userId: input.actor.userId,
      sourceIp,
    });
    if (!failure.shouldAlert) return;

    const thresholdEvent: AuthSecurityEventInput = {
      ...baseEvent,
      id: crypto.randomUUID(),
      eventType: 'step_up_failure_threshold',
      reasonCode: 'REPEATED_STEP_UP_FAILURE',
      metadata: {
        purpose: input.purpose,
        failureCount: failure.count,
        windowSeconds: 900,
        retryAfterSeconds: failure.ttlSeconds,
      },
    };
    await repos.securityEvents.append(thresholdEvent);
    await sendSecurityAlert(thresholdEvent);
  } catch {
    await recordAuthSecuritySubsystemFailure({
      request: input.request,
      actor: input.actor,
      component: 'redis_step_up_failure_tracker',
      reasonCode: 'STEP_UP_FAILURE_TRACKING_UNAVAILABLE',
    });
    throw new Error('Step-up failure tracking unavailable');
  }
}
