import { getPostgresClient } from "@/lib/postgres";

interface RunWakeClient {
  query(sql: string): Promise<unknown>;
  on(event: string, listener: (message: { channel?: string }) => void): unknown;
  removeListener(event: string, listener: (message: { channel?: string }) => void): unknown;
  release(): void;
}

export interface PostgresRunWakeSourceOptions {
  connect?: () => Promise<RunWakeClient>;
  fallbackPollMs?: number;
}

export class PostgresRunWakeSource {
  private readonly connect: () => Promise<RunWakeClient>;
  private readonly fallbackPollMs: number;
  private readonly waiters = new Set<() => void>();
  private client: RunWakeClient | null = null;
  private connecting: Promise<RunWakeClient> | null = null;
  private closed = false;

  constructor(options: PostgresRunWakeSourceOptions = {}) {
    this.connect = options.connect || getPostgresClient;
    this.fallbackPollMs = Math.max(1, options.fallbackPollMs || 1_000);
  }

  async wait(signal?: AbortSignal): Promise<void> {
    if (this.closed || signal?.aborted) return;
    try {
      await this.ensureClient();
    } catch {
      await waitForDelay(this.fallbackPollMs, signal);
      return;
    }
    if (this.closed || signal?.aborted) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.waiters.delete(finish);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, this.fallbackPollMs);
      this.waiters.add(finish);
      signal?.addEventListener("abort", finish, { once: true });
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.resolveWaiters();
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      await client.query("UNLISTEN agent_run_available");
    } finally {
      client.removeListener("notification", this.onNotification);
      client.removeListener("error", this.onError);
      client.release();
    }
  }

  private async ensureClient(): Promise<RunWakeClient> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().then(async (client) => {
      client.on("notification", this.onNotification);
      client.on("error", this.onError);
      await client.query("LISTEN agent_run_available");
      this.client = client;
      return client;
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private readonly onNotification = (message: { channel?: string }) => {
    if (message.channel === "agent_run_available") this.resolveWaiters();
  };

  private readonly onError = () => {
    const client = this.client;
    this.client = null;
    client?.release();
    this.resolveWaiters();
  };

  private resolveWaiters(): void {
    const waiters = Array.from(this.waiters);
    this.waiters.clear();
    waiters.forEach((resolve) => resolve());
  }
}

function waitForDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
