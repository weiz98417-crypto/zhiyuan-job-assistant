import { describe, expect, it } from "vitest";
import { productionAgentEvalBacklog } from "@/__tests__/fixtures/agent-production-e2e-backlog";

describe("production Agent E2E eval backlog", () => {
  it("keeps every production finding uniquely addressable and reproducible", () => {
    expect(new Set(productionAgentEvalBacklog.map((item) => item.id)).size).toBe(productionAgentEvalBacklog.length);
    for (const item of productionAgentEvalBacklog) {
      expect(item.prompt.trim()).not.toBe("");
      expect(item.expectedOutcome.trim()).not.toBe("");
      expect(item.observedOutcome.trim()).not.toBe("");
      expect(item.sessionIds.length).toBeGreaterThan(0);
    }
  });

  it("releases systemic execution findings once their milestone design lands (0.11.0-D2 unfreeze)", () => {
    // M2 修好了 intent_routing;A/B/C 落地 admission/方言/单写者,D2 完成换芯后,
    // task_execution / gate_resume / conversation_progression 的设计冻结全部解除。
    const systemic = productionAgentEvalBacklog.filter((item) =>
      ["task_execution", "gate_resume", "conversation_progression"].includes(item.cluster),
    );

    expect(systemic.length).toBeGreaterThanOrEqual(6);
    expect(systemic.every((item) => item.disposition === "guardrail")).toBe(true);
    // 路由用例永不回退到 frozen。
    const routing = productionAgentEvalBacklog.filter((item) => item.cluster === "intent_routing");
    expect(routing.length).toBeGreaterThanOrEqual(4);
    expect(routing.every((item) => item.disposition === "guardrail")).toBe(true);
  });

  it("keeps passed and locally fixed behaviors as release guardrails", () => {
    expect(productionAgentEvalBacklog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "PE2E-SESSION-001", disposition: "guardrail" }),
      expect.objectContaining({ id: "PE2E-UI-001", disposition: "fixed_locally" }),
    ]));
  });
});
