import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const TEST_USER = {
  userId: "user-bootstrap-route",
  username: "bootstrap-route",
  role: "member",
  tokenVersion: 0,
};

function mockAuth() {
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => TEST_USER,
  }));
}

function mockRuntime() {
  const runtime = {
    createRun: vi.fn(async (_principal: unknown, command: unknown) => ({
      run: {
        id: "run-bootstrap",
        status: "queued",
        ...(command as object),
      },
      replayed: false,
    })),
    submitInput: vi.fn(async () => ({
      run: { id: "run-bootstrap", status: "queued" },
      input: { id: "input-bootstrap" },
      replayed: false,
    })),
    listRuns: vi.fn(async () => []),
    getRun: vi.fn(async () => ({
      id: "run-bootstrap",
      taskType: "interview_coaching",
      status: "queued",
      conversationId: 77,
    })),
  };
  vi.doMock("@/lib/agent/runtime/runtime-factory", () => ({
    getDurableAgentRuntime: () => runtime,
    isDurableAgentRuntimeAvailable: () => true,
  }));
  vi.doMock("@/lib/agent/runtime/runtime-mode", () => ({
    resolveAgentRuntimeAssignment: () => ({
      mode: "worker_all",
      owner: "worker",
      shadow: false,
      cohortBucket: 1,
    }),
  }));
  return runtime;
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/runtime/runtime-factory");
  vi.doUnmock("@/lib/agent/runtime/runtime-mode");
});

describe("hidden Agent bootstrap route regression", () => {
  it("preserves the hidden marker while normalizing PostgreSQL Run inputs", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/agent/runtime/postgres-agent-run-store.ts"),
      "utf8",
    );

    expect(source).toContain('content.persistInConversation === false ? { persistInConversation: false } : {}');
  });

  it("preserves persistInConversation=false on both create and continuation routes", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const createRoute = await import("@/app/api/agent/runs/route");
    const inputRoute = await import("@/app/api/agent/runs/[id]/inputs/route");

    await createRoute.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "bootstrap-create",
        conversationId: 77,
        taskType: "interview_coaching",
        agentId: "interview",
        input: { content: "隐藏 bootstrap", persistInConversation: false },
      }),
    }));
    await inputRoute.POST(new Request("http://localhost/api/agent/runs/run-bootstrap/inputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "bootstrap-follow-up",
        input: { content: "隐藏续跑", persistInConversation: false },
      }),
    }), { params: Promise.resolve({ id: "run-bootstrap" }) });

    expect(runtime.createRun).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      expect.objectContaining({ input: { content: "隐藏 bootstrap", images: undefined, persistInConversation: false } }),
    );
    expect(runtime.submitInput).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "run-bootstrap",
      "bootstrap-follow-up",
      { content: "隐藏续跑", images: undefined, persistInConversation: false },
    );
  });
});
