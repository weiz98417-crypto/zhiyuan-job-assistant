import { describe, expect, it } from "vitest";
import {
  classifyMemoryAdmission,
  containsForbiddenMemoryContent,
  hasExplicitMemoryErasureIntent,
  resolveAdmissionPartition,
  type MemoryAdmissionInput,
} from "@/lib/memory/admission";

const fact = {
  partition: "core",
  subject: "user",
  predicate: "target_city",
  object: { city: "上海" },
  canonicalText: "我现在希望在上海找工作",
  confidence: 0.9,
  importance: 0.8,
};

function admission(overrides: Partial<MemoryAdmissionInput> = {}): MemoryAdmissionInput {
  return {
    userId: "user-1",
    agentId: "profile",
    kind: "conversation",
    sourceType: "conversation_message",
    sourceId: "message-1",
    fact,
    evidence: { quote: fact.canonicalText },
    ...overrides,
  };
}

describe("memory admission", () => {
  it("keeps incidental conversation and a direct remember request pending", () => {
    expect(classifyMemoryAdmission(admission(), { discoveryEnabled: true })).toMatchObject({
      outcome: "candidate",
      candidateKind: "conversation",
    });
    expect(classifyMemoryAdmission(admission({ kind: "remember_request" }), { discoveryEnabled: false })).toMatchObject({
      outcome: "candidate",
      candidateKind: "remember_request",
    });
  });

  it("rejects automatic discovery when turned off but allows user initiated requests", () => {
    expect(classifyMemoryAdmission(admission(), { discoveryEnabled: false }).outcome).toBe("rejected");
    expect(classifyMemoryAdmission(admission({ kind: "session_observation" }), { discoveryEnabled: false }).outcome).toBe("rejected");
    expect(classifyMemoryAdmission(admission({ kind: "remember_request" }), { discoveryEnabled: false }).outcome).toBe("candidate");
  });

  it("activates only a present, direct, unambiguous preference", () => {
    const current = admission({
      kind: "current_preference",
      evidence: { quote: fact.canonicalText, directCurrentIntent: true },
    });
    expect(classifyMemoryAdmission(current, { discoveryEnabled: true }).outcome).toBe("active");
    for (const cue of [
      { isQuotation: true },
      { isHypothetical: true },
      { isHistorical: true },
      { isInterviewAnswer: true },
      { isDocument: true },
      { isDerived: true },
    ]) {
      expect(classifyMemoryAdmission({ ...current, evidence: { ...current.evidence, ...cue } }, { discoveryEnabled: true }).outcome).toBe("clarify");
    }
    expect(classifyMemoryAdmission({ ...current, evidence: { quote: "忘记我曾在某公司工作", directCurrentIntent: true } }, { discoveryEnabled: true }).outcome).toBe("clarify");
  });

  it("requires confirmed job-seeking use for sensitive restrictions", () => {
    const salary = admission({
      kind: "current_preference",
      fact: { ...fact, predicate: "salary_floor", canonicalText: "我的薪资底线是 30k" },
      evidence: { quote: "我的薪资底线是 30k", directCurrentIntent: true },
    });
    expect(classifyMemoryAdmission(salary, { discoveryEnabled: true }).outcome).toBe("clarify");
    expect(classifyMemoryAdmission({ ...salary, evidence: { ...salary.evidence, confirmedJobUse: true } }, { discoveryEnabled: true }).outcome).toBe("active");
    expect(resolveAdmissionPartition(salary.fact)).toBe("private");
    expect(resolveAdmissionPartition({ ...salary.fact, partition: "evaluation" })).toBe("private");
  });

  it("detects sensitive values nested in fact objects and evidence", () => {
    const nested = admission({
      kind: "current_preference",
      fact: {
        ...fact,
        object: { restriction: "work authorization required" },
        canonicalText: "我有一项求职限制",
      },
      evidence: { quote: "我有一项求职限制", directCurrentIntent: true },
    });
    expect(classifyMemoryAdmission(nested, { discoveryEnabled: true }).outcome).toBe("clarify");
    expect(resolveAdmissionPartition(nested.fact)).toBe("private");
  });

  it("never stores credentials or identity numbers as candidates or active facts", () => {
    for (const text of ["密码是 abcdef123", "{\"password\":\"abcdef123\"}", "sk-12345678901234567890", "身份证号 11010519491231002X"]) {
      expect(containsForbiddenMemoryContent(text)).toBe(true);
      expect(classifyMemoryAdmission(admission({ fact: { ...fact, canonicalText: text } }), { discoveryEnabled: true }).outcome).toBe("rejected");
    }
  });

  it("does not treat a past-tense recollection as a deletion request", () => {
    expect(hasExplicitMemoryErasureIntent("我忘记了我曾在某公司工作")).toBe(false);
    expect(hasExplicitMemoryErasureIntent("请忘记我曾在某公司工作")).toBe(true);
    expect(hasExplicitMemoryErasureIntent("删除关于我目标城市的记忆")).toBe(true);
  });

  it("requires read-back artifact evidence for verified task facts", () => {
    const task = admission({ kind: "verified_task", evidence: { quote: "report complete", artifactId: "report-3", resultEvidence: "read-back report #3" } });
    expect(classifyMemoryAdmission(task, { discoveryEnabled: true }).outcome).toBe("rejected");
    expect(classifyMemoryAdmission({ ...task, evidence: { ...task.evidence, verifiedReadBack: true } }, { discoveryEnabled: true }).outcome).toBe("active");
  });

  it("does not turn a click or single dismissal into a preference", () => {
    expect(classifyMemoryAdmission(admission({ kind: "behavior", evidence: { quote: "dismissed job", consistentBehaviorCount: 1 } }), { discoveryEnabled: true }).outcome).toBe("behavior_signal");
    expect(classifyMemoryAdmission(admission({ kind: "behavior", evidence: { quote: "dismissed similar jobs", consistentBehaviorCount: 3 } }), { discoveryEnabled: true }).outcome).toBe("candidate");
  });

  it("rejects suppressed sources and keeps documents and team review out of personal memory", () => {
    expect(classifyMemoryAdmission(admission(), { discoveryEnabled: true, suppressed: true }).outcome).toBe("rejected");
    expect(classifyMemoryAdmission(admission({ kind: "source_document" }), { discoveryEnabled: true }).outcome).toBe("rejected");
    expect(classifyMemoryAdmission(admission({ kind: "team_review" }), { discoveryEnabled: true }).outcome).toBe("rejected");
  });
});
