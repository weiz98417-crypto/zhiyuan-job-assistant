import crypto from 'crypto';
import { getSecurityRedisClient } from '@/lib/security/redis-client';

export interface RateLimitCounterStore {
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttlSeconds: number }>;
  read(key: string): Promise<{ count: number; ttlSeconds: number }>;
  delete(key: string): Promise<void>;
}

export interface LoginIdentity {
  account: string;
  sourceIp: string;
}

export type LoginLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'PAIR_LIMIT' | 'ACCOUNT_LIMIT' | 'IP_LIMIT'; retryAfterSeconds: number };

const LIMITS = {
  pair: { max: 5, ttlSeconds: 15 * 60 },
  account: { max: 10, ttlSeconds: 30 * 60 },
  ip: { max: 30, ttlSeconds: 15 * 60 },
} as const;

const INCREMENT_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

class RedisCounterStore implements RateLimitCounterStore {
  async increment(key: string, ttlSeconds: number) {
    const redis = await getSecurityRedisClient();
    const result = await redis.eval(INCREMENT_WITH_TTL, {
      keys: [key],
      arguments: [String(ttlSeconds)],
    }) as [number, number];
    return { count: Number(result[0]), ttlSeconds: Math.max(1, Number(result[1])) };
  }

  async read(key: string) {
    const redis = await getSecurityRedisClient();
    const [value, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
    return { count: Number(value || 0), ttlSeconds: Math.max(0, ttl) };
  }

  async delete(key: string) {
    const redis = await getSecurityRedisClient();
    await redis.del(key);
  }
}

export class LoginRateLimiter {
  constructor(
    private readonly store: RateLimitCounterStore,
    private readonly hmacSecret: string,
  ) {}

  keyForTesting(type: 'pair' | 'account' | 'ip', account: string, sourceIp: string): string {
    return this.key(type, { account, sourceIp });
  }

  async beforeAttempt(identity: LoginIdentity): Promise<LoginLimitResult> {
    try {
      const normalized = this.normalize(identity);
      const ip = await this.store.increment(this.key('ip', normalized), LIMITS.ip.ttlSeconds);
      if (ip.count > LIMITS.ip.max) {
        return { allowed: false, reason: 'IP_LIMIT', retryAfterSeconds: ip.ttlSeconds };
      }
      const [pair, account] = await Promise.all([
        this.store.read(this.key('pair', normalized)),
        this.store.read(this.key('account', normalized)),
      ]);
      if (pair.count >= LIMITS.pair.max) {
        return { allowed: false, reason: 'PAIR_LIMIT', retryAfterSeconds: pair.ttlSeconds };
      }
      if (account.count >= LIMITS.account.max) {
        return { allowed: false, reason: 'ACCOUNT_LIMIT', retryAfterSeconds: account.ttlSeconds };
      }
      return { allowed: true };
    } catch {
      throw new LoginRateLimitUnavailableError('Login rate limiter unavailable');
    }
  }

  async recordFailure(identity: LoginIdentity): Promise<void> {
    try {
      const normalized = this.normalize(identity);
      await Promise.all([
        this.store.increment(this.key('pair', normalized), LIMITS.pair.ttlSeconds),
        this.store.increment(this.key('account', normalized), LIMITS.account.ttlSeconds),
      ]);
    } catch {
      throw new LoginRateLimitUnavailableError('Login rate limiter unavailable');
    }
  }

  async recordSuccess(identity: LoginIdentity): Promise<void> {
    try {
      const normalized = this.normalize(identity);
      await this.store.delete(this.key('pair', normalized));
    } catch {
      throw new LoginRateLimitUnavailableError('Login rate limiter unavailable');
    }
  }

  private normalize(identity: LoginIdentity): LoginIdentity {
    return {
      account: identity.account.trim().toLowerCase(),
      sourceIp: identity.sourceIp.trim().toLowerCase(),
    };
  }

  private key(type: 'pair' | 'account' | 'ip', identity: LoginIdentity): string {
    const normalized = this.normalize(identity);
    const value = type === 'pair'
      ? `${normalized.account}\0${normalized.sourceIp}`
      : type === 'account'
        ? normalized.account
        : normalized.sourceIp;
    const digest = crypto.createHmac('sha256', this.hmacSecret).update(value).digest('hex');
    return `auth:login:${type}:${digest}`;
  }
}

class NoopLoginRateLimiter extends LoginRateLimiter {
  constructor() {
    super({
      async increment() { return { count: 0, ttlSeconds: 0 }; },
      async read() { return { count: 0, ttlSeconds: 0 }; },
      async delete() {},
    }, 'development-disabled');
  }
}

export class LoginRateLimitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginRateLimitUnavailableError';
  }
}

let limiter: LoginRateLimiter | null = null;

export function getLoginRateLimiter(): LoginRateLimiter {
  if (limiter) return limiter;
  if (!process.env.REDIS_URL?.trim()) {
    if (process.env.NODE_ENV === 'production') {
      throw new LoginRateLimitUnavailableError('REDIS_URL is required in production');
    }
    limiter = new NoopLoginRateLimiter();
    return limiter;
  }
  const secret = process.env.AUTH_RATE_LIMIT_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new LoginRateLimitUnavailableError('A 32-character auth rate-limit secret is required');
  }
  limiter = new LoginRateLimiter(new RedisCounterStore(), secret);
  return limiter;
}
