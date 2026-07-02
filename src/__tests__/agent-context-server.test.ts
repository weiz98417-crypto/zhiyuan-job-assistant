import { afterEach, describe, expect, it, vi } from "vitest";

describe("server agent context", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not touch browser IndexedDB stores when a server user id is provided", async () => {
    vi.doMock("@/lib/profile-storage", () => ({
      loadProfile: vi.fn(() => {
        throw new Error("client profile storage should not be used on server context");
      }),
    }));
    vi.doMock("@/lib/agent/memory", () => ({
      getRecentInteractions: vi.fn(() => {
        throw new Error("IndexedDB API missing");
      }),
      getPendingDecisions: vi.fn(() => {
        throw new Error("IndexedDB API missing");
      }),
      loadPreferences: vi.fn(() => {
        throw new Error("IndexedDB API missing");
      }),
    }));
    vi.doMock("@/lib/db", () => ({
      default: {
        applications: {
          toArray: vi.fn(() => {
            throw new Error("IndexedDB API missing");
          }),
          orderBy: vi.fn(() => {
            throw new Error("IndexedDB API missing");
          }),
        },
      },
    }));
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        profiles: {
          get: vi.fn(async () => ({
            id: "profile-1",
            data_json: JSON.stringify({ skills: [], preferences: {}, marketFit: {} }),
            goals_json: "{}",
            history_json: "[]",
            last_updated: "2026-06-12T00:00:00.000Z",
          })),
        },
        applications: {
          list: vi.fn(async () => []),
        },
      }),
    }));
    vi.doMock("@/lib/agent/tools", () => ({
      getAllTools: vi.fn(() => []),
      buildToolListForLLM: vi.fn(() => "tools"),
    }));
    vi.doMock("@/lib/agent/knowledge", () => ({
      injectKnowledge: vi.fn(() => "knowledge"),
    }));

    const { assembleContext, clearContextCache } = await import("@/lib/agent/context");
    clearContextCache();
    const context = await assembleContext({
      scenario: "dingwei",
      userId: "user-1",
      maxApplications: 1,
    });

    expect(context.dynamicData.recentInteractions).toEqual([]);
    expect(context.dynamicData.pendingDecisions).toEqual([]);
    expect(context.dynamicData.preferences.rolePreferences).toEqual({});
    expect(context.dynamicData.pipelineSummary.total).toBe(0);
    expect(context.systemPrompt).toContain("tools");
  });
});
