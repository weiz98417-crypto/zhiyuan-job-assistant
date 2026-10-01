import { describe, expect, it, vi } from "vitest";
import { isDisconnectError, MCPManager } from "@/lib/agent/mcp/manager";

describe("Spec 22: disconnect predicate", () => {
  it("matches SDK messages, spawn failures, and the manager's own message, case-insensitively", () => {
    for (const text of [
      "Not connected",
      "Connection closed",
      "MCP server not connected: playwright",
      "spawn ENOENT",
      "stdin EPIPE wrote after end",
      "mcp server NOT CONNECTED: x",
    ]) {
      expect(isDisconnectError(text)).toBe(true);
    }
  });

  it("does not match tool errors or timeouts (zombie boundary)", () => {
    for (const text of [
      "tool deadline exceeded",
      "API timeout after 30000ms",
      "页面不存在",
      "Call timeout",
    ]) {
      expect(isDisconnectError(text)).toBe(false);
    }
  });
});

interface FakeState {
  client: { callTool: ReturnType<typeof vi.fn> };
  transport: { close: ReturnType<typeof vi.fn> };
  tools: never[];
}

/** Stub the private servers map and initServer — no real SDK child processes. */
function managerWithDeadServer(): { manager: MCPManager; state: FakeState; initServer: ReturnType<typeof vi.fn> } {
  const manager = new MCPManager();
  const state: FakeState = {
    client: { callTool: vi.fn(async () => { throw new Error("Not connected"); }) },
    transport: { close: vi.fn(async () => undefined) },
    tools: [],
  };
  (manager as unknown as { servers: Map<string, FakeState> }).servers.set("playwright", state);
  const initServer = vi.fn(async (name: string) => {
    // Reconnect heals the entry: the next call succeeds.
    state.client.callTool = vi.fn(async () => ({
      content: [{ type: "text", text: "recovered" }],
    }));
    (manager as unknown as { servers: Map<string, FakeState> }).servers.set(name, state);
  });
  (manager as unknown as { initServer: typeof initServer }).initServer = initServer;
  return { manager, state, initServer };
}

describe("Spec 22: reconnect on dead stdio child", () => {
  it("reconnects once and replays the call after a confirmed disconnect", async () => {
    const { manager, state } = managerWithDeadServer();
    (manager as unknown as { initServer: (name: string) => Promise<void> }).initServer = vi.fn(async (name: string) => {
      state.client.callTool = vi.fn(async () => ({ content: [{ type: "text", text: "recovered" }] }));
      (manager as unknown as { servers: Map<string, FakeState> }).servers.set(name, state);
    });

    const result = await manager.callTool("playwright", "browser_navigate", { url: "https://www.zhipin.com/" });
    expect(result.success).toBe(true);
    expect((result.data as string)).toContain("recovered");
  });

  it("reports reconnect failure as transient with a reason and allows a later retry", async () => {
    const { manager, state } = managerWithDeadServer();
    (manager as unknown as { initServer: (name: string) => Promise<void> }).initServer = vi.fn(async () => {
      throw new Error("connect timeout");
    });

    const first = await manager.callTool("playwright", "browser_navigate", {});
    expect(first.success).toBe(false);
    expect(first.errorCategory).toBe("transient");
    expect(String(first.error)).toContain("reconnect failed");

    // Next call re-attempts reconnect (predicate matches the self-produced message).
    (manager as unknown as { initServer: (name: string) => Promise<void> }).initServer = vi.fn(async (name: string) => {
      state.client.callTool = vi.fn(async () => ({ content: [{ type: "text", text: "recovered-later" }] }));
      (manager as unknown as { servers: Map<string, FakeState> }).servers.set(name, state);
    });
    const second = await manager.callTool("playwright", "browser_navigate", {});
    expect(second.success).toBe(true);
  });

  it("single-flights concurrent reconnects", async () => {
    const { manager, state } = managerWithDeadServer();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const initServer = vi.fn(async (name: string) => {
      // Release the gate once the single-flight attempt is in flight.
      if (initServer.mock.calls.length === 1) release();
      await gate;
      state.client.callTool = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
      (manager as unknown as { servers: Map<string, FakeState> }).servers.set(name, state);
    });
    (manager as unknown as { initServer: typeof initServer }).initServer = initServer;

    const [a, b] = await Promise.all([
      manager.callTool("playwright", "browser_navigate", {}),
      manager.callTool("playwright", "browser_navigate", {}),
    ]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(initServer).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect on non-disconnect tool errors", async () => {
    const manager = new MCPManager();
    const state: FakeState = {
      client: { callTool: vi.fn(async () => { throw new Error("tool deadline exceeded"); }) },
      transport: { close: vi.fn(async () => undefined) },
      tools: [],
    };
    (manager as unknown as { servers: Map<string, FakeState> }).servers.set("playwright", state);
    const initServer = vi.fn();
    (manager as unknown as { initServer: typeof initServer }).initServer = initServer;

    const result = await manager.callTool("playwright", "browser_navigate", {});
    expect(result.success).toBe(false);
    expect(initServer).not.toHaveBeenCalled();
  });
});
