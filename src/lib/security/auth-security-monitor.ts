import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getDataRepositories, type AuthSecurityEventInput } from '@/lib/data-repositories';
import { getTrustedSourceIp } from '@/lib/security/request-identity';
import { sendSecurityAlert } from '@/lib/security/security-alerts';

interface AuthSecuritySubsystemFailureInput {
  request: NextRequest;
  component: string;
  reasonCode: string;
  actor?: {
    userId: string;
    role: string;
  };
}

export async function recordAuthSecuritySubsystemFailure(
  input: AuthSecuritySubsystemFailureInput,
): Promise<void> {
  const event: AuthSecurityEventInput = {
    id: crypto.randomUUID(),
    eventType: 'auth_security_subsystem_failure',
    actorUserId: input.actor?.userId,
    targetUserId: input.actor?.userId,
    actorRole: input.actor?.role,
    outcome: 'failure',
    reasonCode: input.reasonCode,
    requestId: crypto.randomUUID(),
    sourceIp: getTrustedSourceIp(input.request),
    userAgent: input.request.headers.get('user-agent') || undefined,
    metadata: { component: input.component },
  };

  try {
    await getDataRepositories().securityEvents.append(event);
    await sendSecurityAlert(event);
  } catch {
    console.error('[auth/security-monitor] unable to persist subsystem failure');
  }
}
