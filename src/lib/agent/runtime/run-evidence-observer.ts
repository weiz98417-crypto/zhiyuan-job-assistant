export type RunOutboxStatus = "pending" | "processing" | "delivered" | "dead_letter";

export interface RunOutboxItem {
  id: number;
  runId: string;
  userId: string;
  eventSequence: number;
  topic: string;
  payload: Record<string, unknown>;
  status: RunOutboxStatus;
  attemptCount: number;
  nextAttemptAt: string;
  lockedBy: string | null;
  lastError: string;
  createdAt: string;
}

export interface EnqueueRunOutboxInput {
  runId: string;
  userId: string;
  eventSequence: number;
  topic: string;
  payload: Record<string, unknown>;
}

export interface RunOutboxStore {
  claimBatch(observerId: string, limit: number, now?: Date): Promise<RunOutboxItem[]>;
  markDelivered(itemId: number): Promise<void>;
  markFailed(itemId: number, error: string, now?: Date): Promise<"pending" | "dead_letter">;
}

export type RunEvidenceHandler = (item: RunOutboxItem) => Promise<void>;

export interface RunEvidenceBatchResult {
  claimed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
}

export class RunEvidenceObserver {
  constructor(
    private readonly store: RunOutboxStore,
    private readonly handlers: Record<string, RunEvidenceHandler>,
  ) {}

  async processBatch(observerId: string, limit = 50): Promise<RunEvidenceBatchResult> {
    const items = await this.store.claimBatch(observerId, Math.max(1, Math.min(100, limit)));
    const result: RunEvidenceBatchResult = {
      claimed: items.length,
      delivered: 0,
      failed: 0,
      deadLettered: 0,
    };

    for (const item of items) {
      try {
        const handler = this.handlers[item.topic];
        if (!handler) throw new Error(`No Run Evidence handler for topic ${item.topic}`);
        await handler(item);
        await this.store.markDelivered(item.id);
        result.delivered += 1;
      } catch (error) {
        const status = await this.store.markFailed(
          item.id,
          error instanceof Error ? error.message : "Observer delivery failed",
        );
        result.failed += 1;
        if (status === "dead_letter") result.deadLettered += 1;
      }
    }
    return result;
  }
}

export class InMemoryRunOutboxStore implements RunOutboxStore {
  private readonly items = new Map<number, RunOutboxItem>();
  private sequence = 0;

  async enqueue(input: EnqueueRunOutboxInput): Promise<RunOutboxItem> {
    const now = new Date().toISOString();
    const item: RunOutboxItem = {
      id: ++this.sequence,
      runId: input.runId,
      userId: input.userId,
      eventSequence: input.eventSequence,
      topic: input.topic,
      payload: { ...input.payload },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      lockedBy: null,
      lastError: "",
      createdAt: now,
    };
    this.items.set(item.id, item);
    return cloneItem(item);
  }

  async claimBatch(observerId: string, limit: number, now = new Date()): Promise<RunOutboxItem[]> {
    return Array.from(this.items.values())
      .filter((item) => item.status === "pending" && new Date(item.nextAttemptAt) <= now)
      .sort((left, right) => left.id - right.id)
      .slice(0, limit)
      .map((item) => {
        item.status = "processing";
        item.lockedBy = observerId;
        return cloneItem(item);
      });
  }

  async markDelivered(itemId: number): Promise<void> {
    const item = this.requireItem(itemId);
    item.status = "delivered";
    item.lockedBy = null;
  }

  async markFailed(itemId: number, error: string, now = new Date()): Promise<"pending" | "dead_letter"> {
    const item = this.requireItem(itemId);
    item.attemptCount += 1;
    item.lastError = error.slice(0, 500);
    item.lockedBy = null;
    if (item.attemptCount >= 5) {
      item.status = "dead_letter";
      return "dead_letter";
    }
    item.status = "pending";
    item.nextAttemptAt = new Date(now.getTime() + Math.min(60_000, 1_000 * (2 ** item.attemptCount))).toISOString();
    return "pending";
  }

  async list(): Promise<RunOutboxItem[]> {
    return Array.from(this.items.values()).map(cloneItem);
  }

  private requireItem(itemId: number): RunOutboxItem {
    const item = this.items.get(itemId);
    if (!item) throw new Error("Run Outbox item not found");
    return item;
  }
}

function cloneItem(item: RunOutboxItem): RunOutboxItem {
  return { ...item, payload: { ...item.payload } };
}
