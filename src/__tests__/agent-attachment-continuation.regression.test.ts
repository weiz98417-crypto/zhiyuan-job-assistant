import { describe, expect, it, vi } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import * as intentEnvelope from "@/lib/agent/intent-envelope";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";

describe("AgentChat durable attachment purpose", () => {
  it("binds a short assessment reply to the inspected JD after a worker restart", async () => {
    const principal = { userId: "attachment-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(principal, {
      requestId: "attachment-upload",
      conversationId: 22,
      taskType: "general_chat",
      agentId: "general",
      input: { content: "帮我看", images: ["data:image/png;base64,jd-material"] },
      contract: createAgentTaskContract({ taskType: "general_chat", target: "帮我看" }),
    });
    const inspectImages = vi.fn(async () => ({
      documentType: "jd" as const,
      confidence: 0.96,
      quality: "clear" as const,
      extractedText: "E2E_JD_CURRENT_ONLY，纸鸢测试公司招聘 AI 产品经理，岗位职责：建设 Agent 评估系统；任职要求：熟悉产品规划和数据分析。",
    }));
    const resolveEnvelope = vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({
      kind: "clarify", question: "你想让我做什么？", source: "llm_low_confidence",
      envelope: {
        primaryTask: null, referencedMaterials: [], confidence: "low", audit: [],
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false },
      },
    });
    let transcript: Array<{ role: string; content: string; toolName?: string }> = [];
    const orchestrate = vi.fn(async function* (input: { messages: Array<{ role: string; content: string }>; taskContract: { taskType: string } | null }) {
      expect(input.taskContract?.taskType).toBe("jd_evaluation");
      expect(input.messages.map((message) => message.content).join("\n")).toContain("E2E_JD_CURRENT_ONLY");
      yield {
        type: "tool_result", name: "evaluate_jd_full", success: true, result: "E2E_JD_CURRENT_ONLY 已评估",
        data: { reportNum: 91, reportReadBackVerified: true },
      };
      yield { type: "text", content: "当前 JD 的 Agent 评估职责与产品规划要求已完成分析，报告 91。" };
    });
    const createWorker = (workerId: string) => new AgentWorker({
      workerId, runtime,
      engine: new DurableOrchestratorExecutionEngine({
        runtime, inspectImages,
        loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversationId, messages) => { transcript = messages; },
        orchestrate: orchestrate as never,
      }),
    });
    try {
      expect((await createWorker("attachment-worker-1").runOnce())?.status).toBe("waiting_user");
      expect(transcript.some((message) => message.toolName === "recognize_document_image")).toBe(true);
      expect(orchestrate).not.toHaveBeenCalled();
      await runtime.submitInput(principal, created.run.id, "attachment-purpose", { content: "评估" });
      expect((await createWorker("attachment-worker-2").runOnce())?.status).toBe("succeeded");
      expect(inspectImages).toHaveBeenCalledTimes(1);
      expect(orchestrate).toHaveBeenCalledTimes(1);
      expect(transcript.filter((message) => message.toolName === "recognize_document_image")).toHaveLength(1);
      expect(transcript.filter((message) => message.role === "user").map((message) => message.content)).toEqual(["帮我看", "评估"]);
      expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
    } finally {
      resolveEnvelope.mockRestore();
    }
  });

  it("retains a concrete image-read failure across a short assessment reply and worker restart", async () => {
    const principal = { userId: "unreadable-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(principal, {
      requestId: "unreadable-upload", conversationId: 23, taskType: "general_chat", agentId: "general",
      input: { content: "帮我看", images: ["data:image/png;base64,unreadable"] },
      contract: createAgentTaskContract({ taskType: "general_chat", target: "帮我看" }),
    });
    let transcript: ExecutionConversationMessage[] = [];
    const inspectImages = vi.fn(async () => { throw new Error("OCR 服务超时"); });
    const orchestrate = vi.fn(async function* () {
      yield { type: "text", content: "不应编造评估" };
    });
    const makeWorker = (workerId: string) => new AgentWorker({
      workerId, runtime, engine: new DurableOrchestratorExecutionEngine({
        runtime, inspectImages, orchestrate,
        loadConversation: async () => transcript,
        saveConversation: async (_principal, _id, messages) => { transcript = messages; },
      }),
    });
    expect((await makeWorker("unreadable-worker-1").runOnce())?.status).toBe("waiting_user");
    await runtime.submitInput(principal, created.run.id, "unreadable-purpose", { content: "评估" });
    expect((await makeWorker("unreadable-worker-2").runOnce())?.status).toBe("waiting_user");
    expect(inspectImages).toHaveBeenCalledTimes(1);
    expect(orchestrate).not.toHaveBeenCalled();
    const intake = transcript.filter((message) => message.toolName === "recognize_document_image");
    expect(intake).toHaveLength(1);
    expect(intake[0].toolResult).toMatchObject({ success: false, uiPayload: { status: "failed" } });
    expect(transcript.filter((message) => message.role === "assistant").at(-1)?.content).toContain("超时");
    expect(transcript.filter((message) => message.role === "assistant").at(-1)?.content).not.toContain("想让我做什么");
    expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
  });

  it.each([
    { name: "second image", content: "只评估第二张", images: undefined, expected: "data:image/png;base64,second" },
    { name: "replacement image", content: "评估这张新图", images: ["data:image/png;base64,replacement"], expected: "data:image/png;base64,replacement" },
  ])("evaluates the selected $name without consuming the earlier batch as its source", async ({ content, images, expected }) => {
    const principal = { userId: "selected-image-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(principal, {
      requestId: "multi-image-upload", conversationId: 24, taskType: "general_chat", agentId: "general",
      input: { content: "帮我看", images: ["data:image/png;base64,first", "data:image/png;base64,second"] },
      contract: createAgentTaskContract({ taskType: "general_chat", target: "帮我看" }),
    });
    let transcript: ExecutionConversationMessage[] = [];
    const inspectImages = vi.fn(async (selectedImages: string[]) => ({
      documentType: "jd" as const, confidence: 0.96, quality: "clear" as const,
      extractedText: selectedImages.length === 1
        ? "SELECTED_CURRENT_JD，招聘 AI 产品经理，负责 Agent 评估系统，要求产品规划和数据分析。"
        : "INITIAL_BATCH_JD，招聘数据产品经理，负责数据平台和业务指标，要求项目交付和数据建模。",
    }));
    const orchestrate = vi.fn(async function* (input: {
      messages: Array<{ content: string }>;
      attachmentMaterial?: { images: string[] } | null;
    }) {
      expect(input.attachmentMaterial?.images).toEqual([expected]);
      expect(input.messages.map((message) => message.content).join("\n")).toContain("SELECTED_CURRENT_JD");
      yield {
        type: "tool_result", name: "evaluate_jd_full", success: true, result: "当前选定图片已评估",
        data: { reportNum: 92, reportReadBackVerified: true },
      };
      yield { type: "text", content: "选定图片中的 Agent 评估要求已经完成分析，报告 92。" };
    });
    const makeWorker = (workerId: string) => new AgentWorker({
      workerId, runtime, engine: new DurableOrchestratorExecutionEngine({
        runtime, inspectImages, orchestrate,
        loadConversation: async () => transcript,
        saveConversation: async (_principal, _id, messages) => { transcript = messages; },
      }),
    });
    expect((await makeWorker("multi-image-worker-1").runOnce())?.status).toBe("waiting_user");
    const oldMaterial = (await runtime.getLatestCheckpoint(principal, created.run.id))?.context.attachmentMaterial as { sourceHash: string };
    await runtime.submitInput(principal, created.run.id, "image-selection", { content, images });
    expect((await makeWorker("multi-image-worker-2").runOnce())?.status).toBe("succeeded");
    expect(inspectImages).toHaveBeenLastCalledWith([expected], expect.objectContaining({ userText: content }));
    expect(inspectImages).toHaveBeenCalledTimes(2);
    expect(orchestrate).toHaveBeenCalledTimes(1);
    const newMaterial = (await runtime.getLatestCheckpoint(principal, created.run.id))?.context.attachmentMaterial as { sourceHash: string; images: string[] };
    expect(newMaterial.sourceHash).not.toBe(oldMaterial.sourceHash);
    expect(newMaterial.images).toEqual([expected]);
    expect(transcript.filter((message) => message.toolName === "recognize_document_image")).toHaveLength(2);
    expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
  });

  it.each(["foreign owner", "foreign run"])("rejects attachment recovery from a $0 before model or transcript writes", async (scope) => {
    const principal = { userId: "material-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(principal, {
      requestId: "owner-bound-upload", conversationId: 25, taskType: "general_chat", agentId: "general",
      input: { content: "评估" },
      contract: createAgentTaskContract({ taskType: "general_chat", target: "评估" }),
    });
    const run = await runtime.claimNextRun({ workerId: "owner-bound-worker" });
    const checkpoint = await runtime.saveCheckpoint({
      runId: run!.id, workerId: "owner-bound-worker", fencingToken: run!.fencingToken, boundary: "fixture-corrupted",
      context: { attachmentMaterial: {
        id: "foreign-material", userId: scope === "foreign owner" ? "other-owner" : principal.userId,
        runId: scope === "foreign run" ? "other-run" : run!.id,
        sourceHash: "hash", sourceImages: ["data:image/png;base64,foreign"], images: ["data:image/png;base64,foreign"],
        intake: { documentType: "jd", confidence: 0.96, extractedText: "private material" },
      } },
      plan: {}, budgets: {}, factRefs: [],
    });
    const orchestrate = vi.fn(async function* () { yield { type: "text", content: "不应读取" }; });
    const saveConversation = vi.fn(async () => undefined);
    const engine = new DurableOrchestratorExecutionEngine({
      runtime, loadConversation: async () => [], saveConversation, orchestrate,
    });
    await expect(engine.execute({ run: run!, checkpoint, signal: new AbortController().signal }))
      .rejects.toThrow("Attachment material owner mismatch");
    expect(orchestrate).not.toHaveBeenCalled();
    expect(saveConversation).not.toHaveBeenCalled();
    expect(await runtime.listPendingInputs(principal, created.run.id)).toHaveLength(1);
  });
});
