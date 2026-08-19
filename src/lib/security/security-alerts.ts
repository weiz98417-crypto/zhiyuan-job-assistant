import crypto from 'crypto';
import { getDataRepositories, type AuthSecurityEventInput } from '@/lib/data-repositories';
import { sanitizeAuditMetadata } from '@/lib/security/audit-metadata';

const ALERT_TIMEOUT_MS = 5_000;

type DeliveryFailure = {
  reasonCode: 'WEBHOOK_HTTP_ERROR' | 'WEBHOOK_NETWORK_ERROR' | 'WEBHOOK_MISCONFIGURED';
  retryable: boolean;
  status?: number;
};

async function recordDeliveryFailure(
  source: AuthSecurityEventInput,
  webhookHost: string,
  failure: DeliveryFailure,
): Promise<void> {
  try {
    await getDataRepositories().securityEvents.append({
      id: crypto.randomUUID(),
      eventType: 'alert_delivery_failed',
      actorUserId: source.actorUserId,
      targetUserId: source.targetUserId,
      actorRole: source.actorRole,
      outcome: 'failure',
      reasonCode: failure.reasonCode,
      requestId: source.requestId,
      sourceIp: source.sourceIp,
      metadata: {
        sourceEventId: source.id,
        sourceEventType: source.eventType,
        webhookHost,
        retryable: failure.retryable,
        status: failure.status,
        attempt: 1,
        nextAttemptAfterSeconds: failure.retryable ? 60 : undefined,
      },
    });
  } catch {
    console.error('[security/alert] unable to persist delivery failure');
  }
}

export async function sendSecurityAlert(event: AuthSecurityEventInput): Promise<void> {
  const configuredUrl = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim();
  if (!configuredUrl) {
    if (process.env.NODE_ENV === 'production') {
      await recordDeliveryFailure(event, 'unconfigured', {
        reasonCode: 'WEBHOOK_MISCONFIGURED',
        retryable: false,
      });
    }
    return;
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('HTTPS required');
  } catch {
    await recordDeliveryFailure(event, 'invalid', {
      reasonCode: 'WEBHOOK_MISCONFIGURED',
      retryable: false,
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  let failure: DeliveryFailure | null = null;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': event.id,
    };
    const bearer = process.env.SECURITY_ALERT_WEBHOOK_BEARER_TOKEN?.trim();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        schemaVersion: 1,
        emittedAt: new Date().toISOString(),
        event: {
          id: event.id,
          eventType: event.eventType,
          actorUserId: event.actorUserId,
          targetUserId: event.targetUserId,
          actorRole: event.actorRole,
          outcome: event.outcome,
          reasonCode: event.reasonCode,
          requestId: event.requestId,
          sourceIp: event.sourceIp,
          metadata: sanitizeAuditMetadata(event.metadata),
        },
      }),
    });
    if (!response.ok) {
      failure = {
        reasonCode: 'WEBHOOK_HTTP_ERROR',
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      };
    }
  } catch {
    failure = { reasonCode: 'WEBHOOK_NETWORK_ERROR', retryable: true };
  } finally {
    clearTimeout(timeout);
  }

  if (failure) await recordDeliveryFailure(event, url.hostname, failure);
}
