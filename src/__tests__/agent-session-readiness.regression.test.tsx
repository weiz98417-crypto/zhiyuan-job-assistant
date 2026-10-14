// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSession } from "@/types";
import { setBrowserOwner } from "@/lib/browser-owner";

const mocks = vi.hoisted(() => ({
  search: "",
  migrate: vi.fn(),
  listSessions: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  createRun: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/lib/agent/migrate", () => ({ migrateExploreToAgent: mocks.migrate }));
vi.mock("@/lib/profile-update", () => ({ triggerProfileUpdate: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent/sessions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent/sessions")>(),
  listSessions: mocks.listSessions,
  getSession: mocks.getSession,
  createSession: mocks.createSession,
  updateSession: mocks.updateSession,
}));
vi.mock("@/lib/agent/runtime/durable-run-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent/runtime/durable-run-client")>(),
  createDurableAgentRunClient: mocks.createRun,
  listActiveDurableAgentRunsClient: vi.fn(async () => []),
  listRecentDurableAgentRunsClient: vi.fn(async () => []),
}));

import { useAgentConversation } from "@/components/agent/use-agent-conversation";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function session(id: number): ChatSession {
  return {
    id,
    title: `Conversation ${id}`,
    pinned: false,
    messages: [{ role: "user", content: `Previous message ${id}`, timestamp: "2026-10-14T00:00:00.000Z" }],
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setBrowserOwner("readiness-owner");
  mocks.search = "sessionId=382";
  window.history.replaceState(null, "", "/agent?sessionId=382");
  mocks.migrate.mockResolvedValue(false);
  mocks.listSessions.mockResolvedValue([session(999), session(382)]);
  mocks.getSession.mockImplementation(async (id: number) => session(id));
  mocks.createSession.mockResolvedValue(1000);
  mocks.updateSession.mockResolvedValue(undefined);
  mocks.createRun.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Agent session readiness regression", () => {
  it("blocks submission before initialization without messages, run creation, or signal writes", async () => {
    const migration = deferred<boolean>();
    mocks.migrate.mockReturnValue(migration.promise);
    const { result } = renderHook(() => useAgentConversation());

    expect(result.current.conversationReady).toBe(false);
    await expect(result.current.sendMessage("This must wait for the requested conversation")).rejects.toThrow("对话尚未加载完成");
    expect(result.current.messages).toEqual([]);
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => { migration.resolve(false); });
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    expect(result.current.currentSessionId).toBe(382);
  });

  it("hydrates the requested conversation before accepting a turn and binds the durable run to it", async () => {
    const hydration = deferred<ChatSession>();
    mocks.getSession.mockImplementation((id: number) => id === 382 ? hydration.promise : Promise.resolve(session(id)));
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledWith(382, { preferServer: true, requireServer: true }));

    expect(result.current.currentSessionId).toBeNull();
    expect(result.current.conversationReady).toBe(false);
    await expect(result.current.sendMessage("Hello")).rejects.toThrow("对话尚未加载完成");
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalledWith(999, { preferServer: true, requireServer: true });

    await act(async () => { hydration.resolve(session(382)); });
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    expect(result.current.messages[0].content).toBe("Previous message 382");
    await act(async () => { await result.current.sendMessage("Hello"); });
    expect(mocks.createRun).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 382,
      input: expect.objectContaining({ content: "Hello" }),
    }));
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("blocks a turn while a URL-selected conversation is still hydrating", async () => {
    const { result, rerender } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    const hydration = deferred<ChatSession>();
    mocks.getSession.mockImplementation((id: number) => id === 383 ? hydration.promise : Promise.resolve(session(id)));
    mocks.search = "sessionId=383";
    window.history.replaceState(null, "", "/agent?sessionId=383");
    rerender();

    expect(result.current.conversationReady).toBe(false);
    await expect(result.current.sendMessage("Keep this in conversation 383")).rejects.toThrow("对话尚未加载完成");
    expect(mocks.createRun).not.toHaveBeenCalled();
    await act(async () => { hydration.resolve(session(383)); });
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    expect(result.current.currentSessionId).toBe(383);
    expect(result.current.messages[0].content).toBe("Previous message 383");
  });

  it("fails closed when the requested session is absent and does not fall back to another conversation", async () => {
    mocks.getSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.sessionLoadError).toContain("无法加载该对话"));

    expect(result.current.conversationReady).toBe(false);
    expect(result.current.currentSessionId).toBeNull();
    await expect(result.current.sendMessage("Hello")).rejects.toThrow("无法加载该对话");
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects a stale sender immediately after browser navigation before the next render", async () => {
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    window.history.replaceState(null, "", "/agent?sessionId=384");
    await expect(result.current.sendMessage("Hello")).rejects.toThrow("对话尚未加载完成");
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual(session(382).messages);
  });

  it("blocks sends during manual selection and surfaces a failed hydration instead of using cached context", async () => {
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    const hydration = deferred<ChatSession | undefined>();
    mocks.getSession.mockImplementation((id: number) => id === 999 ? hydration.promise : Promise.resolve(session(id)));
    let selection!: Promise<void>;
    await act(async () => { selection = result.current.handleSelectSession(999); });

    expect(result.current.currentSessionId).toBe(999);
    expect(result.current.conversationReady).toBe(false);
    await expect(result.current.sendMessage("Hello")).rejects.toThrow("对话尚未加载完成");
    expect(mocks.createRun).not.toHaveBeenCalled();
    await act(async () => { hydration.resolve(undefined); await selection; });
    expect(result.current.sessionLoadError).toContain("无法加载该对话");
    expect(result.current.conversationReady).toBe(false);
    await expect(result.current.sendMessage("Hello")).rejects.toThrow("无法加载该对话");
  });

  it("surfaces initialization failure and never creates an unassociated run", async () => {
    mocks.search = "";
    window.history.replaceState(null, "", "/agent");
    mocks.listSessions.mockRejectedValue(new Error("Session list unavailable"));
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.mounted).toBe(true));
    expect(result.current.sessionLoadError).toBe("Session list unavailable");
    expect(result.current.conversationReady).toBe(false);
    await expect(result.current.sendMessage("Hello")).rejects.toThrow("Session list unavailable");
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it.each(["sessionId=382", ""])("restores readiness when navigation returns to the loaded conversation with URL %s before another hydration completes", async (returnSearch) => {
    const { result, rerender } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    const hydration = deferred<ChatSession>();
    mocks.getSession.mockImplementation((id: number) => id === 383 ? hydration.promise : Promise.resolve(session(id)));
    mocks.search = "sessionId=383";
    window.history.replaceState(null, "", "/agent?sessionId=383");
    rerender();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledWith(383, { preferServer: true, requireServer: true }));
    expect(result.current.conversationReady).toBe(false);

    mocks.search = returnSearch;
    window.history.replaceState(null, "", returnSearch ? "/agent?" + returnSearch : "/agent");
    rerender();
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    await act(async () => { hydration.resolve(session(383)); });
    expect(result.current.currentSessionId).toBe(382);
    expect(result.current.conversationReady).toBe(true);
    expect(result.current.messages).toEqual(session(382).messages);
  });

  it.each(["sessionId=382", ""])("clears an unrelated failed URL hydration when returning to loaded context with URL %s", async (returnSearch) => {
    const { result, rerender } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    mocks.getSession.mockImplementation(async (id: number) => id === 383 ? undefined : session(id));
    mocks.search = "sessionId=383";
    window.history.replaceState(null, "", "/agent?sessionId=383");
    rerender();
    await waitFor(() => expect(result.current.sessionLoadError).toContain("无法加载该对话"));

    mocks.search = returnSearch;
    window.history.replaceState(null, "", returnSearch ? "/agent?" + returnSearch : "/agent");
    rerender();
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    expect(result.current.currentSessionId).toBe(382);
    expect(result.current.sessionLoadError).toBeNull();
    expect(result.current.messages).toEqual(session(382).messages);
  });

  it("clears an abandoned manual hydration when the user creates a new conversation", async () => {
    const { result, rerender } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    const hydration = deferred<ChatSession>();
    mocks.getSession.mockImplementation((id: number) => id === 999 ? hydration.promise : Promise.resolve(session(id)));
    let selection!: Promise<void>;
    await act(async () => { selection = result.current.handleSelectSession(999); });
    expect(result.current.conversationReady).toBe(false);
    await act(async () => { await result.current.handleNewSession(); });
    mocks.search = "sessionId=1000";
    rerender();
    await waitFor(() => expect(result.current.conversationReady).toBe(true));
    await act(async () => { hydration.resolve(session(999)); await selection; });
    expect(result.current.currentSessionId).toBe(1000);
    expect(result.current.conversationReady).toBe(true);
    expect(result.current.messages).toEqual([]);
  });
});
