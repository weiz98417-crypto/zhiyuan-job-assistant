import crypto from 'crypto';
import { getSecurityRedisClient } from '@/lib/security/redis-client';

export const STEP_UP_PURPOSES = [
  'admin_password_reset',
  'admin_user_management',
] as const;

export type StepUpPurpose = (typeof STEP_UP_PURPOSES)[number];

export interface StepUpRecord {
  rawToken: string;
  userId: string;
  tokenVersion: number;
  purpose: StepUpPurpose;
  sourceIp: string;
  userAgentDigest: string;
  ttlSeconds: number;
}

export type StepUpConsumeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'STEP_UP_REUSED'
        | 'STEP_UP_EXPIRED'
        | 'STEP_UP_PURPOSE_MISMATCH'
        | 'STEP_UP_CONTEXT_MISMATCH';
    };

export interface StepUpStore {
  issue(record: StepUpRecord): Promise<void>;
  consume(record: Omit<StepUpRecord, 'ttlSeconds'>): Promise<StepUpConsumeResult>;
}

interface StoredStepUp {
  userId: string;
  tokenVersion: number;
  purpose: StepUpPurpose;
  sourceIp: string;
  userAgentDigest: string;
  expiresAt: number;
}

const GET_AND_DELETE = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

function tokenKey(rawToken: string): string {
  const digest = crypto.createHash('sha256').update(rawToken).digest('hex');
  return `auth:step-up:${digest}`;
}

class RedisStepUpStore implements StepUpStore {
  async issue(record: StepUpRecord): Promise<void> {
    const redis = await getSecurityRedisClient();
    const stored: StoredStepUp = {
      userId: record.userId,
      tokenVersion: record.tokenVersion,
      purpose: record.purpose,
      sourceIp: record.sourceIp,
      userAgentDigest: record.userAgentDigest,
      expiresAt: Date.now() + record.ttlSeconds * 1000,
    };
    const result = await redis.set(tokenKey(record.rawToken), JSON.stringify(stored), {
      EX: record.ttlSeconds,
      NX: true,
    });
    if (result !== 'OK') throw new Error('Unable to issue step-up token');
  }

  async consume(record: Omit<StepUpRecord, 'ttlSeconds'>): Promise<StepUpConsumeResult> {
    const redis = await getSecurityRedisClient();
    const value = await redis.eval(GET_AND_DELETE, {
      keys: [tokenKey(record.rawToken)],
      arguments: [],
    });
    if (typeof value !== 'string') return { ok: false, reason: 'STEP_UP_REUSED' };

    let stored: StoredStepUp;
    try {
      stored = JSON.parse(value) as StoredStepUp;
    } catch {
      return { ok: false, reason: 'STEP_UP_CONTEXT_MISMATCH' };
    }
    if (stored.expiresAt <= Date.now()) return { ok: false, reason: 'STEP_UP_EXPIRED' };
    if (stored.purpose !== record.purpose) {
      return { ok: false, reason: 'STEP_UP_PURPOSE_MISMATCH' };
    }
    if (
      stored.userId !== record.userId ||
      stored.tokenVersion !== record.tokenVersion ||
      stored.sourceIp !== record.sourceIp ||
      stored.userAgentDigest !== record.userAgentDigest
    ) {
      return { ok: false, reason: 'STEP_UP_CONTEXT_MISMATCH' };
    }
    return { ok: true };
  }
}

let store: StepUpStore | null = null;

export function getStepUpStore(): StepUpStore {
  store ||= new RedisStepUpStore();
  return store;
}
