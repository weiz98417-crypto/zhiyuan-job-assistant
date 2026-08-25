import { describe, expect, it, vi } from "vitest";
import { PostgresRunWakeSource } from "@/lib/agent/runtime/postgres-run-wake-source";

describe("PostgreSQL Agent Run wake source", () => {
  it("wakes on NOTIFY and keeps polling as a fallback", async () => {
    const listeners = new Map<string, (message: { channel: string }) => void>();
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      on: vi.fn((event: string, listener: (message: { channel: string }) => void) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
      release: vi.fn(),
    };
    const source = new PostgresRunWakeSource({
      connect: async () => client,
      fallbackPollMs: 1_000,
    });

    const waiting = source.wait();
    await vi.waitFor(() => expect(client.query).toHaveBeenCalledWith("LISTEN agent_run_available"));
    listeners.get("notification")?.({ channel: "agent_run_available" });
    await waiting;
    await source.close();

    expect(client.query).toHaveBeenCalledWith("UNLISTEN agent_run_available");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
