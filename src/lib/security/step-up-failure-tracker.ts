import crypto from 'crypto';
import { getSecurityRedisClient } from '@/lib/security/redis-client';

const FAILURE_WINDOW_SECONDS = 15 * 60;
const ALERT_THRESHOLD = 5;

const INCREMENT_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export interface StepUpFailureCounterStore {
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttlSeconds: number }>;
}

export interface StepUpFailureIdentity {
  userId: string;
  sourceIp: string;
}

export interface StepUpFailureResult {
  count: number;
  ttlSeconds: number;
  shouldAlert: boolean;
}

class RedisStepUpFailureCounterStore implements StepUpFailureCounterStore {
  async increment(key: string, ttlSeconds: number) {
    const redis = await getSecurityRedisClient();
    const result = await redis.eval(INCREMENT_WITH_TTL, {
      keys: [key],
      arguments: [String(ttlSeconds)],
    }) as [number, number];
    return {
      count: Number(result[0]),
      ttlSeconds: Math.max(1, Number(result[1])),
    };
  }
}

export class StepUpFailureTracker {
  constructor(
    private readonly store: StepUpFailureCounterStore,
    private readonly hmacSecret: string,
  ) {}

  async recordFailure(identity: StepUpFailureIdentity): Promise<StepUpFailureResult> {
    const userId = identity.userId.trim().toLowerCase();
    const sourceIp = identity.sourceIp.trim().toLowerCase();
    const digest = crypto.createHmac('sha256', this.hmacSecret)
      .update(`${userId}\0${sourceIp}`)
      .digest('hex');
    const result = await this.store.increment(
      `auth:step-up:failure:${digest}`,
      FAILURE_WINDOW_SECONDS,
    );
    return {
      ...result,
      shouldAlert: result.count === ALERT_THRESHOLD,
    };
  }
}

export class StepUpFailureTrackingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepUpFailureTrackingUnavailableError';
  }
}

let tracker: StepUpFailureTracker | null = null;

export function getStepUpFailureTracker(): StepUpFailureTracker {
  if (tracker) return tracker;
  const secret = process.env.AUTH_RATE_LIMIT_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new StepUpFailureTrackingUnavailableError(
      'A 32-character authentication security secret is required',
    );
  }
  tracker = new StepUpFailureTracker(new RedisStepUpFailureCounterStore(), secret);
  return tracker;
}
