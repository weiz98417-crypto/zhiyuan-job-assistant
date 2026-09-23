import { describe, expect, it, vi } from "vitest";

const { getDurableAgentRuntime } = vi.hoisted(() => ({
  getDurableAgentRuntime: vi.fn(),
}));

vi.mock("@/lib/agent/runtime/runtime-factory", () => ({ getDurableAgentRuntime }));

import { validateHandoff, validateDelegation } from "@/lib/agent/agent-collaboration";
import { transferToAgent } from "@/lib/agent/tools/action/transfer-to-agent";
import { delegateResearch } from "@/lib/agent/tools/action/delegate-research";

describe("agent collaboration (M4, ADR-0024)", () => {
  describe("handoff validation", () => {
    it("allows a legal transition edge (resume_query -> jd_evaluation family)", () => {
      const result = validateHandoff({ currentTask: "resume_query", targetAgentId: "evaluate" });
      expect(result.allowed).toBe(true);
      expect(result.toTask).toBe("jd_evaluation");
    });

    it("rejects an off-graph handoff (offer_evaluation -> evaluate/jd)", () => {
      const result = validateHandoff({ currentTask: "offer_evaluation", targetAgentId: "evaluate" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("合法任务转换图");
    });

    it("rejects handing off to the same responsible agent", () => {
      const result = validateHandoff({ currentTask: "jd_evaluation", targetAgentId: "evaluate" });
      expect(result.allowed).toBe(false);
    });

    it("rejects unknown target agents", () => {
      const result = validateHandoff({ currentTask: "general_chat", targetAgentId: "ghost" });
      expect(result.allowed).toBe(false);
    });
  });

  describe("delegation validation", () => {
    it("restricts the child toolset to the readonly intersection", () => {
      const result = validateDelegation({
        targetAgentId: "resume",
        agentAllowlist: ["read_file", "save_resume_section", "web_search"],
      });
      expect(result.allowed).toBe(true);
      expect(result.effectiveTools).toContain("read_file");
      expect(result.effectiveTools).not.toContain("save_resume_section");
    });

    it("never delegates write-task agents", () => {
      const card = validateDelegation({ targetAgentId: "resume", agentAllowlist: undefined });
      expect(card.allowed).toBe(true);
      // profile/reference agents are not in AGENT_CARDS as delegation targets;
      // write-task agents would map to forbidden base tasks.
      const unknown = validateDelegation({ targetAgentId: "profile", agentAllowlist: undefined });
      expect(unknown.allowed).toBe(false);
    });
  });

  describe("worker-only enforcement", () => {
    it("transfer_to_agent refuses without a durable worker context", async () => {
      const result = await transferToAgent.handler(
        { target_agent_id: "evaluate", reason: "测试" },
        { principal: { userId: "u1" }, runId: "run-1", allowlist: [] },
      );
      expect(result.success).toBe(false);
      expect(result.errorCategory).toBe("policy_denied");
    });

    it("delegate_research refuses without a durable worker context", async () => {
      const result = await delegateResearch.handler(
        { goal: "查一下这家公司", target_agent_id: "general" },
        { principal: { userId: "u1" }, runId: "run-1", allowlist: [] },
      );
      expect(result.success).toBe(false);
      expect(result.errorCategory).toBe("policy_denied");
    });

    it("transfer_to_agent consults the run contract and refuses off-graph hops", async () => {
      getDurableAgentRuntime.mockReturnValue({
        getRun: vi.fn(async () => ({
          id: "run-1",
          contract: { taskType: "offer_evaluation" },
        })),
      });
      const result = await transferToAgent.handler(
        { target_agent_id: "evaluate", reason: "顺手评估" },
        { principal: { userId: "u1" }, runId: "run-1", allowlist: [], workerId: "w1", fencingToken: 3 },
      );
      expect(result.success).toBe(false);
      expect(result.errorCategory).toBe("policy_denied");
    });
  });
});
