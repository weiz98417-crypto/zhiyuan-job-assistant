import { describe, expect, it } from 'vitest';
import {
  StepUpFailureTracker,
  type StepUpFailureCounterStore,
} from '@/lib/security/step-up-failure-tracker';

class MemoryCounterStore implements StepUpFailureCounterStore {
  readonly values = new Map<string, { count: number; ttlSeconds: number }>();

  async increment(key: string, ttlSeconds: number) {
    const current = this.values.get(key);
    const next = { count: (current?.count || 0) + 1, ttlSeconds };
    this.values.set(key, next);
    return next;
  }
}

describe('step-up failure tracking', () => {
  it('raises one threshold signal for five failures in a fifteen-minute window', async () => {
    const store = new MemoryCounterStore();
    const tracker = new StepUpFailureTracker(store, 'step-up-test-secret-with-at-least-32-characters');

    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(await tracker.recordFailure({
        userId: 'admin-1',
        sourceIp: '203.0.113.10',
      }));
    }

    expect(results.map((result) => result.shouldAlert)).toEqual([
      false, false, false, false, true, false,
    ]);
    expect(results[4]).toMatchObject({ count: 5, ttlSeconds: 900 });
  });

  it('stores only an HMAC digest instead of raw account and address values', async () => {
    const store = new MemoryCounterStore();
    const tracker = new StepUpFailureTracker(store, 'step-up-test-secret-with-at-least-32-characters');

    await tracker.recordFailure({ userId: 'admin-1', sourceIp: '203.0.113.10' });

    const [key] = [...store.values.keys()];
    expect(key).toMatch(/^auth:step-up:failure:[a-f0-9]{64}$/);
    expect(key).not.toContain('admin-1');
    expect(key).not.toContain('203.0.113.10');
  });
});
