import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  LoginRateLimiter,
  LoginRateLimitUnavailableError,
  type RateLimitCounterStore,
} from '@/lib/security/login-rate-limit';
import { getTrustedSourceIp } from '@/lib/security/request-identity';

class PersistentFakeCounterStore implements RateLimitCounterStore {
  private counters = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, ttlSeconds: number) {
    const now = Date.now();
    const current = this.counters.get(key);
    const next = !current || current.expiresAt <= now
      ? { count: 1, expiresAt: now + ttlSeconds * 1000 }
      : { ...current, count: current.count + 1 };
    this.counters.set(key, next);
    return { count: next.count, ttlSeconds: Math.max(1, Math.ceil((next.expiresAt - now) / 1000)) };
  }

  async read(key: string) {
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= Date.now()) return { count: 0, ttlSeconds: 0 };
    return {
      count: current.count,
      ttlSeconds: Math.max(1, Math.ceil((current.expiresAt - Date.now()) / 1000)),
    };
  }

  async delete(key: string) {
    this.counters.delete(key);
  }
}

describe('distributed login rate limiting', () => {
  it('preserves pair failures when the application limiter instance is replaced', async () => {
    const store = new PersistentFakeCounterStore();
    const firstProcess = new LoginRateLimiter(store, 'test-hmac-secret');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await firstProcess.beforeAttempt({ account: 'Admin', sourceIp: '203.0.113.8' });
      await firstProcess.recordFailure({ account: 'Admin', sourceIp: '203.0.113.8' });
    }

    const restartedProcess = new LoginRateLimiter(store, 'test-hmac-secret');
    const result = await restartedProcess.beforeAttempt({
      account: ' admin ',
      sourceIp: '203.0.113.8',
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('PAIR_LIMIT');
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('clears only the successful account and IP pair while retaining the IP attempt counter', async () => {
    const store = new PersistentFakeCounterStore();
    const limiter = new LoginRateLimiter(store, 'test-hmac-secret');
    await limiter.beforeAttempt({ account: 'member', sourceIp: '203.0.113.9' });
    await limiter.recordFailure({ account: 'member', sourceIp: '203.0.113.9' });
    await limiter.recordSuccess({ account: 'member', sourceIp: '203.0.113.9' });

    const next = await limiter.beforeAttempt({ account: 'member', sourceIp: '203.0.113.9' });
    expect(next.allowed).toBe(true);
    expect(await store.read(limiter.keyForTesting('pair', 'member', '203.0.113.9'))).toMatchObject({ count: 0 });
    expect((await store.read(limiter.keyForTesting('ip', '', '203.0.113.9'))).count).toBe(2);
  });

  it('ignores an internet client supplied x-forwarded-for value', () => {
    const request = new NextRequest('https://example.test/api/auth/login', {
      headers: {
        'x-real-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.99',
      },
    });

    expect(getTrustedSourceIp(request)).toBe('203.0.113.10');
  });

  it('normalizes Redis failures into a fail-closed subsystem error', async () => {
    const failingStore: RateLimitCounterStore = {
      async increment() { throw new Error('redis connection refused'); },
      async read() { return { count: 0, ttlSeconds: 0 }; },
      async delete() {},
    };
    const limiter = new LoginRateLimiter(failingStore, 'test-hmac-secret');

    await expect(limiter.beforeAttempt({
      account: 'admin',
      sourceIp: '203.0.113.10',
    })).rejects.toBeInstanceOf(LoginRateLimitUnavailableError);
  });
});
