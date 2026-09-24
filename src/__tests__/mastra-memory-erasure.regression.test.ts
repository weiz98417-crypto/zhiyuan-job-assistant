import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Memory: vi.fn(),
  PostgresStore: vi.fn(function PostgresStore() {
    return { init: vi.fn(async () => undefined) };
  }),
  PgVector: vi.fn(function PgVector() {
    return {};
  }),
  isPostgresConfigured: vi.fn(() => true),
  getPostgresPool: vi.fn(() => ({})),
  createEmbeddingProvider: vi.fn(() => ({
    model: "test-embedder",
    embed: vi.fn(async (values: string[]) => values.map(() => [0.1])),
  })),
}));

vi.mock("@mastra/memory", () => ({ Memory: mocks.Memory }));
vi.mock("@mastra/pg", () => ({ PostgresStore: mocks.PostgresStore, PgVector: mocks.PgVector }));
vi.mock("@/lib/postgres", () => ({
  isPostgresConfigured: mocks.isPostgresConfigured,
  getPostgresPool: mocks.getPostgresPool,
}));
vi.mock("@/lib/memory/vector-memory", () => ({
  createEmbeddingProvider: mocks.createEmbeddingProvider,
  MEMORY_EMBEDDING_DIMENSION: 1,
}));
vi.mock("@/lib/ai/model-gateway", () => ({ complete: vi.fn() }));

describe("Mastra targeted erasure regression", () => {
  it("deletes raw messages and vectors only in the target thread", async () => {
    const target = "private employer";
    const messages = [
      {
        id: "target-thread-message",
        threadId: "conversation:1",
        resourceId: "user-1",
        role: "user",
        content: { format: 2, parts: [{ type: "text", text: `I worked at ${target}` }] },
      },
      {
        id: "other-thread-message",
        threadId: "conversation:2",
        resourceId: "user-1",
        role: "user",
        content: { format: 2, parts: [{ type: "text", text: `I worked at ${target}` }] },
      },
      {
        id: "target-thread-signal",
        threadId: "conversation:1",
        resourceId: "user-1",
        role: "signal",
        content: { format: 2, parts: [{ type: "text", text: `signal includes ${target}` }] },
      },
      {
        id: "keep-thread-message",
        threadId: "conversation:1",
        resourceId: "user-1",
        role: "user",
        content: { format: 2, parts: [{ type: "text", text: "keep this" }] },
      },
    ];
    const deletedMessageIds: string[][] = [];
    const deletedVectorIds: string[][] = [];
    const memory = {
      recall: vi.fn(async ({ threadId, hideSignals }: { threadId: string; hideSignals?: boolean }) => ({
        messages: messages.filter((message) => message.threadId === threadId && !(hideSignals && message.role === "signal")),
        total: messages.filter((message) => message.threadId === threadId && !(hideSignals && message.role === "signal")).length,
        page: 0,
        perPage: false,
        hasMore: false,
      })),
      listMessagesByResourceId: vi.fn(async () => ({ messages })),
      deleteMessages: vi.fn(async (ids: string[]) => {
        deletedMessageIds.push(ids);
        for (const id of ids) {
          const index = messages.findIndex((message) => message.id === id);
          if (index >= 0) messages.splice(index, 1);
        }
      }),
      deleteMessageVectors: vi.fn(async (ids: string[]) => deletedVectorIds.push(ids)),
      getWorkingMemory: vi.fn(async () => null),
      updateWorkingMemory: vi.fn(),
      storage: {
        getStore: vi.fn(async () => ({
          getObservationalMemory: vi.fn(async () => null),
          updateActiveObservations: vi.fn(),
        })),
      },
      settled: vi.fn(async () => undefined),
    };
    mocks.Memory.mockImplementationOnce(function Memory() {
      return memory;
    });
    vi.stubEnv("DATABASE_URL", "postgres://test");

    const { createMastraSessionContract } = await import("@/lib/memory/mastra-adapter");
    const contract = createMastraSessionContract();
    await contract.eraseTarget({ resourceId: "user-1", threadId: "conversation:1", targetText: target });

    expect(deletedMessageIds).toEqual([["target-thread-message", "target-thread-signal"]]);
    expect(deletedVectorIds).toEqual([["target-thread-message", "target-thread-signal"]]);
    expect(memory.listMessagesByResourceId).not.toHaveBeenCalled();
    expect(memory.recall.mock.calls.every(([input]) => input.hideSignals === false)).toBe(true);
    expect(messages.map((message) => message.id)).toEqual(["other-thread-message", "keep-thread-message"]);
    const lastRecall = memory.recall.mock.results.at(-1);
    expect(lastRecall?.type).toBe("return");
    const readBack = await lastRecall?.value;
    expect(JSON.stringify(readBack.messages)).not.toContain(target);
    expect(JSON.stringify(messages.find((message) => message.id === "other-thread-message"))).toContain(target);
  });
});
