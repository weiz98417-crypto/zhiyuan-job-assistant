export type RuntimeResource = "model" | "ocr" | "write" | "tool";

export type RuntimeResourceLimits = Record<RuntimeResource, number>;

interface Waiter {
  resolve(release: () => void): void;
  reject(error: Error): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class RuntimeResourceScheduler {
  private readonly limits: RuntimeResourceLimits;
  private readonly active: Record<RuntimeResource, number> = {
    model: 0,
    ocr: 0,
    write: 0,
    tool: 0,
  };
  private readonly queues: Record<RuntimeResource, Waiter[]> = {
    model: [],
    ocr: [],
    write: [],
    tool: [],
  };

  constructor(limits: Partial<RuntimeResourceLimits> = {}) {
    this.limits = {
      model: positiveLimit(limits.model, 2),
      ocr: positiveLimit(limits.ocr, 1),
      write: positiveLimit(limits.write, 1),
      tool: positiveLimit(limits.tool, 4),
    };
  }

  async run<T>(
    resource: RuntimeResource,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const release = await this.acquire(resource, signal);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private acquire(resource: RuntimeResource, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (this.active[resource] < this.limits[resource]) {
      this.active[resource] += 1;
      return Promise.resolve(this.release(resource));
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      waiter.onAbort = () => {
        const index = this.queues[resource].indexOf(waiter);
        if (index >= 0) this.queues[resource].splice(index, 1);
        reject(abortError(signal));
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.queues[resource].push(waiter);
    });
  }

  private release(resource: RuntimeResource): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active[resource] = Math.max(0, this.active[resource] - 1);
      const waiter = this.queues[resource].shift();
      if (!waiter) return;
      waiter.signal?.removeEventListener("abort", waiter.onAbort!);
      this.active[resource] += 1;
      waiter.resolve(this.release(resource));
    };
  }
}

export const sharedRuntimeResourceScheduler = new RuntimeResourceScheduler();

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error("Resource wait aborted");
}
