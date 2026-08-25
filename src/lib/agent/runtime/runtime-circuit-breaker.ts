export interface RuntimeCircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
  probeInFlight: boolean;
}

export class CircuitOpenError extends Error {
  constructor(key: string, halfOpen = false) {
    super(halfOpen
      ? `runtime circuit half-open probe already in flight: ${key}`
      : `runtime circuit open: ${key}`);
    this.name = "CircuitOpenError";
  }
}

export class RuntimeCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly states = new Map<string, CircuitState>();

  constructor(options: RuntimeCircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold || 3);
    this.cooldownMs = Math.max(1, options.cooldownMs || 30_000);
    this.now = options.now || Date.now;
  }

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const state = this.states.get(key) || { failures: 0, openedAt: null, probeInFlight: false };
    this.states.set(key, state);
    const now = this.now();
    const halfOpen = state.openedAt !== null && now - state.openedAt >= this.cooldownMs;
    if (state.openedAt !== null && !halfOpen) throw new CircuitOpenError(key);
    if (halfOpen && state.probeInFlight) throw new CircuitOpenError(key, true);
    if (halfOpen) state.probeInFlight = true;

    try {
      const result = await operation();
      this.states.delete(key);
      return result;
    } catch (error) {
      state.failures += 1;
      state.probeInFlight = false;
      if (halfOpen || state.failures >= this.failureThreshold) state.openedAt = now;
      throw error;
    }
  }
}

export const sharedRuntimeCircuitBreaker = new RuntimeCircuitBreaker();
