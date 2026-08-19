import crypto from 'crypto';
import { getSecurityRedisClient } from '@/lib/security/redis-client';

export type PasswordRecoveryLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'ACCOUNT_LIMIT' | 'IP_LIMIT';
      retryAfterSeconds: number;
    };

const LIMITS = {
  account: { max: 3, ttlSeconds: 60 * 60 },
  ip: { max: 10, ttlSeconds: 60 * 60 },
} as const;

const INCREMENT_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export class PasswordRecoveryRateLimitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordRecoveryRateLimitUnavailableError';
  }
}
export class PasswordRecoveryRateLimiter {
  constructor(private readonly hmacSecret: string) {}

  async consume(identity: { account: string; sourceIp: string }): Promise<PasswordRecoveryLimitResult> {
    try {
      const redis = await getSecurityRedisClient();
      const accountKey = this.key('account', identity.account.trim().toLowerCase());
      const ipKey = this.key('ip', identity.sourceIp.trim().toLowerCase());
      const [account, ip] = await Promise.all([
        redis.eval(INCREMENT_WITH_TTL, {
          keys: [accountKey],
          arguments: [String(LIMITS.account.ttlSeconds)],
        }) as Promise<[number, number]>,
        redis.eval(INCREMENT_WITH_TTL, {
          keys: [ipKey],
          arguments: [String(LIMITS.ip.ttlSeconds)],
        }) as Promise<[number, number]>,
      ]);
      if (Number(ip[0]) > LIMITS.ip.max) {
        return {
          allowed: false,
          reason: 'IP_LIMIT',
          retryAfterSeconds: Math.max(1, Number(ip[1])),
        };
      }
      if (Number(account[0]) > LIMITS.account.max) {
        return {
          allowed: false,
          reason: 'ACCOUNT_LIMIT',
          retryAfterSeconds: Math.max(1, Number(account[1])),
        };
      }
      return { allowed: true };
    } catch (error) {
      if (error instanceof PasswordRecoveryRateLimitUnavailableError) throw error;
      throw new PasswordRecoveryRateLimitUnavailableError('Password recovery rate limiter unavailable');
    }
  }

  keyForTesting(type: 'account' | 'ip', value: string): string {
    return this.key(type, value.trim().toLowerCase());
  }

  private key(type: 'account' | 'ip', value: string): string {
    const digest = crypto.createHmac('sha256', this.hmacSecret).update(value).digest('hex');
    return `auth:password-recovery:${type}:${digest}`;
  }
}

class NoopPasswordRecoveryRateLimiter extends PasswordRecoveryRateLimiter {
  constructor() {
    super('development-disabled');
  }

  override async consume(): Promise<PasswordRecoveryLimitResult> {
    return { allowed: true };
  }
}

let limiter: PasswordRecoveryRateLimiter | null = null;

export function getPasswordRecoveryRateLimiter(): PasswordRecoveryRateLimiter {
  if (limiter) return limiter;
  if (!process.env.REDIS_URL?.trim()) {
    if (process.env.NODE_ENV === 'production') {
      throw new PasswordRecoveryRateLimitUnavailableError('REDIS_URL is required in production');
    }
    limiter = new NoopPasswordRecoveryRateLimiter();
    return limiter;
  }
  const secret = process.env.AUTH_RATE_LIMIT_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new PasswordRecoveryRateLimitUnavailableError(
      'A 32-character auth rate-limit secret is required',
    );
  }
  limiter = new PasswordRecoveryRateLimiter(secret);
  return limiter;
}
