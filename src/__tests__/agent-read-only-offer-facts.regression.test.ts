import { afterEach, describe, expect, it, vi } from "vitest";
import { admitAgentRun } from "@/lib/agent/run-admission";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import * as intentEnvelope from "@/lib/agent/intent-envelope";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";

afterEach(() => vi.restoreAllMocks());

describe("read-only Offer facts completion", () => {
  it("completes only the requested factual projection with source evidence and no write or model call", async () => {
    const source = "仅整理这份 Offer 的事实，不要保存报告：甲公司，前端工程师，月薪20K，14薪，年终奖2个月但不保证发放，公积金0%，试用期0个月。";
    const admission = admitAgentRun({ conversationId: 53, input: { content: source } });
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "facts-owner" };
    const created = await runtime.createRun(principal, { requestId: "facts-request", conversationId: 53,
      taskType: admission.taskType!, agentId: admission.agentId!, input: { content: source }, contract: admission.contract });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({
      kind: "resolved", source: "llm", envelope: { primaryTask: "offer_evaluation", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "forbidden", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } },
    });
    let transcript: Array<{ role: string; content: string }> = [];
    const model = vi.fn(async function* () { yield { type: "text" as const, content: "已经保存 Offer 报告。" }; });
    const engine = new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => [],
      saveConversation: async (_owner, _conversation, messages) => { transcript = messages; }, orchestrate: model });
    const run = await runtime.claimNextRun({ workerId: "facts-worker" });
    const result = await engine.execute({ run: run!, checkpoint: null, signal: new AbortController().signal });
    expect(result.outcome).toBe("succeeded");
    expect(model).not.toHaveBeenCalled();
    const answer = transcript.findLast((message) => message.role === "assistant")?.content || "";
    expect(answer).toContain("社保：未明确");
    expect(answer).toContain("公积金：0%");
    expect(answer).toContain("试用期：0个月");
    expect(answer).toContain("非保证");
    expect(answer).toContain("未写入");
    expect(answer).not.toContain("已经保存");
    const checkpoint = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(checkpoint?.context.readOnlyFacts).toMatchObject({ sourceQuote: source, userId: "facts-owner", runId: created.run.id });
    expect((checkpoint?.context.readOnlyFacts as { sourceHash: string }).sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await runtime.listEvents(principal, created.run.id, 0)).some((event) => event.type.startsWith("tool."))).toBe(false);
  });

  it("waits for missing material and resumes within the same Run after a short reply and restart", async () => {
    const source = "只整理 Offer 事实，不要保存报告";
    const admission = admitAgentRun({ conversationId: 54, input: { content: source } });
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "missing-facts-owner" };
    const created = await runtime.createRun(principal, { requestId: "missing-facts", conversationId: 54,
      taskType: admission.taskType!, agentId: admission.agentId!, input: { content: source }, contract: admission.contract });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({
      kind: "resolved", source: "llm", envelope: { primaryTask: "offer_evaluation", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } },
    });
    let transcript: ExecutionConversationMessage[] = [];
    const model = vi.fn(async function* () { yield { type: "text" as const, content: "已保存" }; });
    const worker = (workerId: string) => new AgentWorker({ workerId, runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, orchestrate: model, loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversationId, messages) => { transcript = messages; } }) });
    expect(await worker("missing-worker-1").runOnce()).toMatchObject({ id: created.run.id, status: "waiting_user" });
    expect((await runtime.getLatestCheckpoint(principal, created.run.id))?.context.readOnlyFacts).toBeUndefined();
    await runtime.submitInput(principal, created.run.id, "missing-facts-reply", { content: "月薪18K，公积金0%，无社保" });
    expect(await worker("missing-worker-2").runOnce()).toMatchObject({ id: created.run.id, status: "succeeded", taskType: "offer_evaluation" });
    expect(model).not.toHaveBeenCalled();
    expect(transcript.filter((message) => message.role === "user").map((message) => message.content)).toEqual([source, "月薪18K，公积金0%，无社保"]);
    const answer = transcript.findLast((message) => message.role === "assistant")!.content;
    expect(answer).toContain("18000（币种未明确）");
    expect(answer).toContain("社保：不提供");
    expect(answer).toContain("试用期：未明确");
    expect((await runtime.getLatestCheckpoint(principal, created.run.id))?.context.taskContract).toMatchObject({ routing: { intentConstraints: { writePolicy: "forbidden" } } });
  });

  it("reconciles the original admission with a corrected Offer goal using the same Run identity", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "goal-facts-owner" };
    const created = await runtime.createRun(principal, { requestId: "goal-facts", conversationId: 55,
      taskType: "general_chat", agentId: "general", input: { content: "只整理这份 Offer 的事实，不要保存报告：月薪25K，15薪。" } });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({
      kind: "resolved", source: "llm", envelope: { primaryTask: "offer_evaluation", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "forbidden", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } },
    });
    const worker = new AgentWorker({ workerId: "goal-facts-worker", runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => [], saveConversation: async () => undefined,
        orchestrate: async function* () { throw new Error("Read-only facts must not call model"); } }) });
    expect(await worker.runOnce()).toMatchObject({ id: created.run.id, status: "succeeded", taskType: "offer_evaluation", agentId: "offer",
      contract: { taskType: "offer_evaluation", routing: { completionMode: "read_only_facts" } } });
    expect(await runtime.listRuns(principal)).toHaveLength(1);
  });

  it("uses the selected Offer image after purpose clarification without a model or evaluation write", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "image-facts-owner" };
    const created = await runtime.createRun(principal, { requestId: "image-facts", conversationId: 56,
      taskType: "general_chat", agentId: "general", input: { content: "帮我看", images: ["data:image/png;base64,offer-original"] } });
    let transcript: ExecutionConversationMessage[] = [];
    const inspectImages = vi.fn(async () => ({ documentType: "offer" as const, confidence: 0.96, quality: "clear" as const,
      extractedText: "甲公司录用通知书：前端工程师，月薪20K，14薪；公积金0%，试用期0个月；年终奖金视绩效而定。" }));
    const model = vi.fn(async function* () { throw new Error("Image facts must not use model"); });
    const worker = (workerId: string) => new AgentWorker({ workerId, runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, inspectImages, orchestrate: model, loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversationId, messages) => { transcript = messages; } }) });
    expect(await worker("image-facts-worker-1").runOnce()).toMatchObject({ id: created.run.id, status: "waiting_user" });
    await runtime.submitInput(principal, created.run.id, "image-facts-purpose", { content: "只整理事实，不要保存报告" });
    expect(await worker("image-facts-worker-2").runOnce()).toMatchObject({ id: created.run.id, status: "succeeded", taskType: "offer_evaluation" });
    const checkpoint = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(checkpoint?.context.readOnlyFacts).toMatchObject({ sourceKind: "offer_attachment", runId: created.run.id,
      facts: { monthlySalary: 20_000, socialInsurance: null, providentFundRate: 0, probationMonths: 0 } });
    expect((checkpoint?.context.readOnlyFacts as { attachmentHash: string }).attachmentHash).toBe((checkpoint?.context.attachmentMaterial as { sourceHash: string }).sourceHash);
    expect(inspectImages).toHaveBeenCalledTimes(1);
    expect(model).not.toHaveBeenCalled();
    expect(transcript.filter((message) => message.toolName === "recognize_document_image")).toHaveLength(1);
  });

  it("completes a verified Offer attachment's original facts even when compensation fields remain unknown", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "unknown-attachment-owner" };
    const source = "只整理这份 Offer 原文事实，不要保存报告";
    const originalText = "甲公司录用通知：岗位为前端工程师，入职日期2026年11月1日。薪资和福利另行确认。";
    const created = await runtime.createRun(principal, { requestId: "unknown-attachment", conversationId: 58,
      taskType: "general_chat", agentId: "general", input: { content: source, images: ["data:image/png;base64,offer-no-compensation"] } });
    let transcript: ExecutionConversationMessage[] = [];
    const model = vi.fn(async function* () { throw new Error("Verified original facts must not invoke a model"); });
    const worker = new AgentWorker({ workerId: "unknown-attachment-worker", runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversation, messages) => { transcript = messages; }, orchestrate: model,
        inspectImages: async () => ({ documentType: "offer", confidence: 0.98, quality: "clear", extractedText: originalText }) }) });
    expect(await worker.runOnce()).toMatchObject({ id: created.run.id, status: "succeeded" });
    expect((await runtime.getLatestCheckpoint(principal, created.run.id))?.context.readOnlyFacts).toMatchObject({
      sourceKind: "offer_attachment", sourceQuote: expect.stringContaining(originalText), facts: {
        monthlySalary: null, salaryCurrency: null, salaryMonths: null, bonusMonths: null,
        socialInsurance: null, providentFundRate: null, probationMonths: null,
      },
    });
    expect(transcript.findLast((message) => message.role === "assistant")?.content).toContain(originalText);
    expect(transcript.findLast((message) => message.role === "assistant")?.content).toContain("月薪：未明确");
    expect(model).not.toHaveBeenCalled();
  });

  it.each([
    { content: "仅整理 Offer 事实：月薪待定，假设月薪20K；不要保存报告。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "只整理 Offer 事实，不要保存报告：月薪20K。\n刚才月薪20K只是示例，实际未明确。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告：月薪3000美元，公积金0%。", expected: "succeeded", monthlySalary: 3_000, salaryCurrency: "USD" },
    { content: "只整理 Offer 事实，不要保存报告：月薪20K，公积金0%。\n更正：月薪实际未明确。", expected: "succeeded", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实：假设月薪20K，公积金7%，试用期3个月；不要保存报告。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告。\n假设：\n月薪20K\n公积金7%\n试用期3个月", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告：薪资待定，12-14薪，公积金0%。", expected: "succeeded", monthlySalary: null, salaryCurrency: null, salaryMonths: null },
    { content: "仅整理 Offer 事实，不要保存报告：月薪3千元。", expected: "succeeded", monthlySalary: 3_000, salaryCurrency: "CNY" },
    { content: "仅整理 Offer 事实，不要保存报告：月薪20K-25K。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告：月薪20K - 25K，公积金0%。", expected: "succeeded", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告：月薪20,000元。", expected: "succeeded", monthlySalary: 20_000, salaryCurrency: "CNY" },
    { content: "仅整理 Offer 事实，不要保存报告：月薪3百元。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告：月薪" + "9".repeat(400) + "元。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
    { content: "仅整理 Offer 事实，不要保存报告：月薪9007199254740993元。", expected: "waiting_user", monthlySalary: null, salaryCurrency: null },
  ])("preserves source semantics for $content", async (scenario) => {
    const { content, expected, monthlySalary, salaryCurrency } = scenario;
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "boundary-facts-owner" };
    const admission = admitAgentRun({ conversationId: 57, input: { content } });
    const created = await runtime.createRun(principal, { requestId: "boundary-facts", conversationId: 57,
      taskType: admission.taskType!, agentId: admission.agentId!, input: { content }, contract: admission.contract });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "offer_evaluation", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "forbidden", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    let transcript: ExecutionConversationMessage[] = [];
    const model = vi.fn(async function* () { throw new Error("Factual boundaries must not use model"); });
    const worker = new AgentWorker({ workerId: "boundary-facts-worker", runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => transcript,
        saveConversation: async (_principal, _conversation, messages) => { transcript = messages; }, orchestrate: model }) });
    expect(await worker.runOnce()).toMatchObject({ id: created.run.id, status: expected });
    const material = (await runtime.getLatestCheckpoint(principal, created.run.id))?.context.readOnlyFacts;
    if (expected === "waiting_user") expect(material).toBeUndefined();
    else expect(material).toMatchObject({ facts: { monthlySalary, salaryCurrency } });
    if ("salaryMonths" in scenario) expect(material).toMatchObject({ facts: { salaryMonths: scenario.salaryMonths } });
    if (salaryCurrency === "USD") expect(transcript.findLast((message) => message.role === "assistant")?.content).toContain("月薪：3000美元");
    expect(model).not.toHaveBeenCalled();
  });
});
