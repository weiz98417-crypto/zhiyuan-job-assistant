import { afterEach, describe, expect, it, vi } from "vitest";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { buildContractForTask } from "@/lib/agent/run-admission";
import { buildCareerPositioningFallback } from "@/lib/agent/career-positioning-result";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";
import * as intentEnvelope from "@/lib/agent/intent-envelope";
import * as contextDirectives from "@/lib/agent/runtime/server-run-context-directives";
import * as positioningService from "@/lib/server/career-positioning-service";
import * as dataRepositories from "@/lib/data-repositories";
import { stableContentHash } from "@/lib/agent/verified-action";

const governed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent/runtime/governed-tool-runtime", () => ({ executeGovernedRuntimeTool: governed }));
const model = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/model-gateway", async (original) => ({ ...(await original<Record<string, unknown>>()), streamChat: model }));
afterEach(() => { vi.restoreAllMocks(); governed.mockReset(); model.mockReset(); });

describe("positioning confirmation through the Worker", () => {
  it.each([false, true])("keeps the same Run and respects forbidden writes=%s while completing a displayed evidence-bound conclusion", async (forbidden) => {
    const principal = { userId: "worker-positioning-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const userMessages = [
      { role: "user" as const, content: "我想做AI产品", itemId: "goal" },
      { role: "user" as const, content: "我还在学React，不会Python", itemId: "learn" },
      { role: "user" as const, content: "先给我阶段性结论", itemId: "conclusion" },
    ];
    const displayed = buildCareerPositioningFallback({ messages: userMessages, assistantText: "定位结论：AI 产品经理" })!;
    expect(displayed).toContain("来源证据");
    let transcript: ExecutionConversationMessage[] = [...userMessages, { role: "assistant", content: displayed }];
    const contract = buildContractForTask("career_positioning_guidance", "自我定位", undefined, {
      writePolicy: forbidden ? "forbidden" : "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false,
    });
    const created = await runtime.createRun(principal, { requestId: "positioning-worker-confirm", conversationId: 82,
      taskType: "career_positioning_guidance", agentId: "profile", input: { content: "确认保存" }, contract });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "career_positioning_guidance", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    governed.mockImplementation(async (input) => ({ runDirective: "continue", attempt: { result: input.policyDenial || {
      success: true, data: { done: true, readBackVerified: true, summary: "定位假设已依据原始来源保存，并完成读回核对。" }, errorCategory: "ok",
    } } }));
    model.mockImplementation(() => { throw new Error("Positioning confirmation must not invoke model"); });
    const worker = new AgentWorker({ workerId: "positioning-confirm-worker", runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversation, messages) => { transcript = messages; },
        orchestrate: (input) => agentLoopServer({ systemPrompt: "profile", messages: input.messages,
          taskContract: input.taskContract, frozenToolCall: input.frozenToolCall,
          executionContext: { principal, runId: input.runId, conversationId: input.sessionId,
            workerId: input.workerId, fencingToken: input.fencingToken, requestId: input.requestId, allowlist: ["mine_profile"] } }),
      }) });
    expect(await worker.runOnce()).toMatchObject({ id: created.run.id, taskType: "profile_update", agentId: "profile",
      status: forbidden ? "waiting_user" : "succeeded" });
    expect(governed).toHaveBeenCalledTimes(1);
    expect(governed).toHaveBeenCalledWith(expect.objectContaining({ runId: created.run.id, principal,
      toolName: "mine_profile", args: { action: "complete" }, requestId: "positioning-worker-confirm",
      taskContract: expect.objectContaining({ taskType: "profile_update" }),
      ...(forbidden ? { policyDenial: expect.objectContaining({ success: false, errorCategory: "policy_denied" }) } : {}),
    }));
    expect(model).not.toHaveBeenCalled();
    expect(transcript.filter((message) => message.role === "user" && message.content === "确认保存")).toHaveLength(1);
    expect(transcript.findLast((message) => message.role === "assistant")?.content).toContain(forbidden ? "禁止" : "读回");
  });

  it.each([false, true])("does not reuse a prior conclusion after a persisted reset, including reset during this loop=%s", async (resetInLoop) => {
    const principal = { userId: "worker-positioning-reset-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const oldMessages = [
      { role: "user" as const, content: "我想做AI产品", itemId: "old-goal" },
      { role: "user" as const, content: "我精通React", itemId: "old-skill" },
      { role: "user" as const, content: "先给我阶段性结论", itemId: "old-close" },
    ];
    const displayed = buildCareerPositioningFallback({ messages: oldMessages, assistantText: "定位结论：AI 产品经理" })!;
    const reset = { role: "user" as const, content: "重新开始定位", itemId: "positioning-reset" };
    const scene = { kind: "career_positioning_scene" as const, version: 1 as const,
      startAfterTurnId: reset.itemId, startAfterContent: reset.content, startAfterContentHash: stableContentHash(reset.content) };
    let transcript: ExecutionConversationMessage[] = [...oldMessages, { role: "assistant", content: displayed }, reset];
    vi.spyOn(contextDirectives, "buildServerRunContextDirectives").mockResolvedValue({
      interviewContext: "", rebindContext: "", guidedDirective: "", interviewState: undefined,
      interviewRebindAction: null, activeGuidedSession: null, positioningScene: resetInLoop ? null : scene,
    });
    const reload = vi.spyOn(positioningService, "loadCareerPositioningScene").mockResolvedValue(scene);
    const source = resetInLoop ? reset.content : "确认保存";
    const created = await runtime.createRun(principal, { requestId: "positioning-worker-reset", conversationId: 83,
      taskType: "career_positioning_guidance", agentId: "profile", input: { content: source },
      contract: buildContractForTask("career_positioning_guidance", source) });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "career_positioning_guidance", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    const orchestration = vi.fn(async function* (input) {
      expect(input.frozenToolCall).toBeUndefined();
      yield { type: "tool_result", name: "mine_profile", success: true, data: resetInLoop
        ? { reset: true, stage: 0, done: false, readBackVerified: true, careerPositioningScene: scene }
        : { stage: 0, done: false } };
      yield { type: "text", content: "定位结论：你精通React，适合AI产品经理" };
    });
    const worker = new AgentWorker({ workerId: "positioning-reset-worker", runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversation, messages) => { transcript = messages; }, orchestrate: orchestration }) });
    const completed = await worker.runOnce();
    expect(completed, JSON.stringify((await runtime.getLatestCheckpoint(principal, created.run.id))?.context.recovery)).toMatchObject({ id: created.run.id, taskType: "career_positioning_guidance", status: "succeeded" });
    expect(orchestration).toHaveBeenCalledTimes(1);
    expect(governed).not.toHaveBeenCalled();
    expect(transcript.findLast((message) => message.role === "assistant")?.content).toContain("当前个人经历证据不足");
    expect(transcript.findLast((message) => message.role === "assistant")?.content).not.toContain("你精通React");
    if (resetInLoop) {
      expect(reload).toHaveBeenCalledWith(principal, 83);
      expect(transcript.find((message) => message.toolName === "mine_profile")?.toolResult).toMatchObject({
        kind: "silent", status: "success", readBackVerified: true, careerPositioningReset: scene, durableRunId: created.run.id,
      });
      vi.spyOn(contextDirectives, "buildServerRunContextDirectives").mockResolvedValue({
        interviewContext: "", rebindContext: "", guidedDirective: "", interviewState: undefined,
        interviewRebindAction: null, activeGuidedSession: null, positioningScene: null,
      });
      const followup = await runtime.createRun(principal, { requestId: "positioning-worker-lost-reset", conversationId: 83,
        taskType: "career_positioning_guidance", agentId: "profile", input: { content: "确认保存" },
        contract: buildContractForTask("career_positioning_guidance", "确认保存") });
      const blocked = await worker.runOnce();
      expect(blocked?.id).toBe(followup.run.id);
      expect(blocked?.status).not.toBe("succeeded");
      expect(orchestration).toHaveBeenCalledTimes(1);
      expect((await runtime.getLatestCheckpoint(principal, followup.run.id))?.context.recovery).toMatchObject({
        observation: { fingerprint: expect.stringContaining("场次边界丢失") },
      });
    }
  });
});

describe("server-owned positioning scene directives", () => {
  it("reads the persisted scene instead of a client-advertised reset boundary", async () => {
    const content = "重新开始定位";
    const scene = { kind: "career_positioning_scene", version: 1, startAfterTurnId: "server-reset",
      startAfterContent: content, startAfterContentHash: stableContentHash(content) };
    const repositories = { sessions: { get: vi.fn(async () => ({ agent_state_json: JSON.stringify({ careerPositioningScene: scene }) })) } };
    vi.spyOn(dataRepositories, "getDataRepositories").mockReturnValue(repositories as unknown as ReturnType<typeof dataRepositories.getDataRepositories>);
    expect(await contextDirectives.buildServerRunContextDirectives({ principal: { userId: "scene-owner" }, conversationId: 84,
      content: "继续", agentState: { careerPositioningScene: { ...scene, startAfterTurnId: "client-forgery" } } }))
      .toMatchObject({ positioningScene: scene });
    expect(repositories.sessions.get).toHaveBeenCalledWith(84, "scene-owner");
  });

  it.each(["not-json", JSON.stringify({ careerPositioningScene: { startAfterTurnId: "broken" } })])("rejects corrupted persisted positioning state %s", async (state) => {
    const repositories = { sessions: { get: async () => ({ agent_state_json: state }) } };
    vi.spyOn(dataRepositories, "getDataRepositories").mockReturnValue(repositories as unknown as ReturnType<typeof dataRepositories.getDataRepositories>);
    await expect(contextDirectives.buildServerRunContextDirectives({ principal: { userId: "scene-owner" }, conversationId: 84,
      content: "确认保存" })).rejects.toThrow();
  });

  it("keeps an unrelated task independent of a damaged prior positioning scene", async () => {
    const repositories = { sessions: { get: async () => ({ agent_state_json: JSON.stringify({ careerPositioningScene: { startAfterTurnId: "broken" } }) }) } };
    vi.spyOn(dataRepositories, "getDataRepositories").mockReturnValue(repositories as unknown as ReturnType<typeof dataRepositories.getDataRepositories>);
    await expect(contextDirectives.buildServerRunContextDirectives({ principal: { userId: "scene-owner" }, conversationId: 84,
      content: "评估这个JD", includePositioningScene: false })).resolves.toMatchObject({ positioningScene: null });
  });
});
