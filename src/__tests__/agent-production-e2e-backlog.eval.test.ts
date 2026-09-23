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

  it("freezes systemic execution findings until their milestone design lands", () => {
    const systemic = productionAgentEvalBacklog.filter((item) =>
      ["task_execution", "gate_resume", "conversation_progression"].includes(item.cluster),
    );

    expect(systemic.length).toBeGreaterThanOrEqual(6);
    expect(systemic.every((item) => item.disposition === "frozen_for_design")).toBe(true);
    // M2 released the intent_routing cluster: ROUTE cases are release
    // guardrails now and must never regress to frozen.
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
