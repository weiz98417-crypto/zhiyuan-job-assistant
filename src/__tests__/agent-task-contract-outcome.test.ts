import { describe, expect, it } from "vitest";
import {
  createAgentTaskContract,
  resolveTaskContractRunOutcome,
  type AgentTaskType,
} from "@/lib/agent/task-contract";

const ADVISORY_TASKS: AgentTaskType[] = [
  "general_chat",
  "career_positioning_guidance",
  "interview_coaching",
];

const USER_INPUT_TASKS: AgentTaskType[] = [
  "resume_query",
  "resume_diagnosis",
  "jd_evaluation",
  "offer_evaluation",
  "reference_resume_save",
];

const VERIFIED_EFFECT_TASKS: AgentTaskType[] = [
  "resume_edit",
  "profile_update",
  "file_export",
  "job_search",
];

describe("Run Contract delivery outcome", () => {
  it.each(ADVISORY_TASKS)("does not mark %s succeeded while required evidence is missing", (taskType) => {
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    const outcome = resolveTaskContractRunOutcome(contract, [], {
      hasAssistantResponse: true,
      hasUserVisibleArtifact: false,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.gate.canClaimSuccess).toBe(false);
    expect(outcome.gate.unmetCriteria).toEqual(contract.successCriteria);
    expect(outcome.replaceAssistantMessage).toBe(true);
  });

  it.each(ADVISORY_TASKS)("does not treat an internal %s tool result as user-visible delivery", (taskType) => {
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    const outcome = resolveTaskContractRunOutcome(contract, [], {
      hasAssistantResponse: false,
      hasUserVisibleArtifact: false,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.gate.canClaimSuccess).toBe(false);
    expect(outcome.replaceAssistantMessage).toBe(true);
  });

  it.each(VERIFIED_EFFECT_TASKS)("keeps %s fail-closed when its verified effect is unmet", (taskType) => {
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    const outcome = resolveTaskContractRunOutcome(contract, [], {
      hasAssistantResponse: true,
      hasUserVisibleArtifact: false,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.gate.canClaimSuccess).toBe(false);
    expect(outcome.replaceAssistantMessage).toBe(true);
  });

  it.each(USER_INPUT_TASKS)("asks for usable input when %s has no source or answer", (taskType) => {
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    const outcome = resolveTaskContractRunOutcome(contract, [], { hasAssistantResponse: false });

    expect(outcome.status).toBe("waiting_user");
    expect(outcome.gate.canClaimSuccess).toBe(false);
    expect(outcome.replaceAssistantMessage).toBe(true);
    expect(outcome.safeMessage).not.toMatch(/契约|校验|落库|成功条件|report persisted/);
  });

  it("waits for user input instead of repeating an unverified JD write", () => {
    const contract = createAgentTaskContract({ taskType: "jd_evaluation", target: "jd" });
    const outcome = resolveTaskContractRunOutcome(contract, [
      "source content extracted or fetched",
      "A-G evaluation generated",
      "report persisted",
    ]);

    expect(outcome.status).toBe("waiting_user");
    expect(outcome.gate.unmetCriteria).toContain("saved report read-back verification passes");
    expect(outcome.safeMessage).not.toMatch(/落库|校验|已保存/);
  });

  it.each(ADVISORY_TASKS)("still recovers %s when no user-visible output exists", (taskType) => {
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    const outcome = resolveTaskContractRunOutcome(contract, [], {
      hasAssistantResponse: false,
      hasUserVisibleArtifact: false,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.replaceAssistantMessage).toBe(true);
  });

  it("never exposes generic success-criterion names over a general chat answer", () => {
    const contract = createAgentTaskContract({ taskType: "general_chat", target: "帮我做自我定位" });
    const outcome = resolveTaskContractRunOutcome(contract, [], {
      hasAssistantResponse: false,
      hasUserVisibleArtifact: false,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.replaceAssistantMessage).toBe(true);
  });
});
