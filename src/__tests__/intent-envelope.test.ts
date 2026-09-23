import { afterEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/model-gateway", () => ({
  complete: completeMock,
  getThinkModelChain: vi.fn(() => []),
}));

import { resolveIntentEnvelope } from "@/lib/agent/intent-envelope";
import { routeAgentTask } from "@/lib/agent/task-routing";

function llmReply(primaryTask: string, confidence: "high" | "medium" | "low"): string {
  return JSON.stringify({ primaryTask, confidence });
}

afterEach(() => {
  completeMock.mockReset();
});

describe("IntentEnvelope (M2)", () => {
  it("PE2E-ROUTE-001: '不要更新画像，帮我做职业定位' keeps career positioning as the primary task", async () => {
    completeMock.mockResolvedValue({ text: llmReply("career_positioning_guidance", "high"), modelUsed: "test" });
    const resolution = await resolveIntentEnvelope({ content: "不要更新画像，帮我做职业定位" });

    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.source).toBe("llm");
    expect(resolution.envelope.primaryTask).toBe("career_positioning_guidance");
    expect(resolution.envelope.constraints.noProfileWrite).toBe(true);
    expect(resolution.envelope.constraints.writePolicy).not.toBe("allowed");

    const decision = routeAgentTask({
      agentId: "profile",
      content: "不要更新画像，帮我做职业定位",
      envelopeTask: resolution.envelope.primaryTask,
      envelopeAudit: resolution.envelope.audit,
    });
    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.auditSummary).toContain("envelope:career_positioning_guidance");
  });

  it("PE2E-ROUTE-002: '不要直接写入，创建一个待审批的简历提案' resolves to resume_edit, not resume_query", async () => {
    completeMock.mockResolvedValue({ text: llmReply("resume_edit", "high"), modelUsed: "test" });
    const resolution = await resolveIntentEnvelope({ content: "不要直接写入，帮我创建一个待审批的简历优化提案" });

    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.envelope.primaryTask).toBe("resume_edit");
    expect(resolution.envelope.constraints.noResumeWrite).toBe(true);
  });

  it("PE2E-ROUTE-003: anaphoric 'JD要求' does not flip an interview turn into jd_evaluation", async () => {
    completeMock.mockResolvedValue({ text: llmReply("interview_coaching", "high"), modelUsed: "test" });
    const resolution = await resolveIntentEnvelope({ content: "这个JD要求里说要有数据经验，第一题怎么回答更好？" });

    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.envelope.primaryTask).toBe("interview_coaching");
    expect(resolution.envelope.referencedMaterials.some((m) => m.kind === "jd")).toBe(true);
  });

  it("PE2E-ROUTE-004: multi-turn career positioning answers record a concrete task, not general_chat", async () => {
    completeMock.mockResolvedValue({ text: llmReply("career_positioning_guidance", "high"), modelUsed: "test" });
    const resolution = await resolveIntentEnvelope({ content: "我更倾向于稳定一点的平台" });

    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.envelope.primaryTask).toBe("career_positioning_guidance");
  });

  it("low model confidence asks one precise question instead of guessing", async () => {
    completeMock.mockResolvedValue({ text: llmReply("jd_evaluation", "low"), modelUsed: "test" });
    const resolution = await resolveIntentEnvelope({ content: "帮我看一下这个" });

    expect(resolution.kind).toBe("clarify");
    if (resolution.kind !== "clarify") return;
    expect(resolution.question.length).toBeGreaterThan(8);
  });

  it("LLM unavailable falls back to the audited regex chain, not clarification storms", async () => {
    completeMock.mockRejectedValue(new Error("no key"));
    const resolution = await resolveIntentEnvelope({ content: "帮我优化一下简历的个人概述" });

    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.source).toBe("regex_fallback");
    expect(resolution.envelope.primaryTask).toBe("resume_edit");
    expect(resolution.envelope.audit.some((entry) => entry.startsWith("envelope.llm_unavailable"))).toBe(true);
  });

  it("'换一批' takes the zero-ambiguity fast path without any LLM call", async () => {
    const resolution = await resolveIntentEnvelope({ content: "换一批" });

    expect(completeMock).not.toHaveBeenCalled();
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.source).toBe("fast_path");
    expect(resolution.envelope.primaryTask).toBe("job_search");
  });
});
