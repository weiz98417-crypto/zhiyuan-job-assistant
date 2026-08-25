import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  evaluateOfferForAgent: vi.fn(),
  compareOffersForAgent: vi.fn(),
  getOfferReportForAgent: vi.fn(),
}));

vi.mock("@/lib/server/offer-agent-service", () => ({
  evaluateOfferForAgent: boundaries.evaluateOfferForAgent,
  compareOffersForAgent: boundaries.compareOffersForAgent,
  getOfferReportForAgent: boundaries.getOfferReportForAgent,
  OfferAgentInputError: class extends Error {},
}));

import { compareOffersDeep } from "@/lib/agent/tools/action/compare-offers-deep";
import { evaluateOffer } from "@/lib/agent/tools/action/evaluate-offer";
import { generateOfferHRQuestionList } from "@/lib/agent/tools/action/generate-offer-hr-question-list";
import { generateOfferNegotiationStrategy } from "@/lib/agent/tools/action/generate-offer-negotiation-strategy";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["evaluate_offer"],
  signal: new AbortController().signal,
};

describe("server Offer tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("evaluates and persists an Offer through the principal-scoped service", async () => {
    boundaries.evaluateOfferForAgent.mockResolvedValue({
      id: 21,
      offerId: 8,
      company: "示例科技",
      role: "产品经理",
      overallScore: 4.2,
      verdict: "accept",
      summary: "总体匹配",
      redFlags: [],
      missingInfo: [],
      readBackVerified: true,
    });

    const result = await evaluateOffer.handler({
      company: "示例科技",
      role: "产品经理",
      monthlySalary: 30,
    }, context);

    expect(result).toMatchObject({
      success: true,
      data: { id: 21, offerId: 8, readBackVerified: true },
    });
    expect(boundaries.evaluateOfferForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ company: "示例科技", role: "产品经理" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reads principal-scoped Offer data for comparison and follow-up guidance", async () => {
    boundaries.compareOffersForAgent.mockResolvedValue({
      reports: [
        { company: "甲", role: "产品", overallScore: 4.5, redFlags: [] },
        { company: "乙", role: "产品", overallScore: 3.8, redFlags: [] },
      ],
      ranking: [{ company: "甲", overallScore: 4.5 }, { company: "乙", overallScore: 3.8 }],
    });
    boundaries.getOfferReportForAgent.mockResolvedValue({
      id: 21,
      company: "甲",
      role: "产品经理",
      overallScore: 4.5,
      redFlags: [],
      missingInfo: ["公积金基数"],
      negotiationLevers: ["争取签字费"],
      hrQuestions: ["公积金按什么基数？"],
    });

    const compare = await compareOffersDeep.handler({ offerIds: [1, 2] }, {
      ...context,
      allowlist: ["compare_offers_deep"],
    });
    const strategy = await generateOfferNegotiationStrategy.handler({ offerReportId: 21 }, {
      ...context,
      allowlist: ["generate_offer_negotiation_strategy"],
    });
    const questions = await generateOfferHRQuestionList.handler({ offerReportId: 21 }, {
      ...context,
      allowlist: ["generate_offer_hr_question_list"],
    });

    expect(compare.success).toBe(true);
    expect(strategy.success).toBe(true);
    expect(questions.success).toBe(true);
    expect(boundaries.compareOffersForAgent).toHaveBeenCalledWith(
      context.principal,
      { offerIds: [1, 2] },
    );
    expect(boundaries.getOfferReportForAgent).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
