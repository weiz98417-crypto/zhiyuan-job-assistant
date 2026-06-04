import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfferSnapshot } from "@/types";
import { evaluateOfferSnapshot, normalizeOfferSnapshot } from "@/lib/offer-evaluation";
import { evaluateOffer } from "@/lib/agent/tools/action/evaluate-offer";

const completeOffer: OfferSnapshot = {
  offerId: 77,
  company: "Acme",
  role: "AI PM",
  location: "Shanghai",
  monthlySalary: 32,
  monthsPerYear: 14,
  annualBonus: 2,
  hasSocialInsurance: true,
  socialInsuranceBaseType: "full_salary",
  housingFundRate: 12,
  probationMonths: 3,
  employmentForm: "direct_hire",
  employerName: "Acme",
  contractMonths: 36,
  overtimePolicy: "none",
  bonusGuarantee: "guaranteed",
  cityCostLevel: "medium",
  jobNature: "core platform product",
};

function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  };
}

function moduleById(report: ReturnType<typeof evaluateOfferSnapshot>, id: string) {
  const module = report.modules.find((item) => item.id === id);
  expect(module).toBeTruthy();
  return module!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("China offer evaluation model", () => {
  it("saves a preliminary report for incomplete offers and exposes missing-info items", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/agent/memory-context")) {
        return okJson({ success: false });
      }
      if (url.includes("/api/offers")) {
        return okJson({ success: true, data: { id: 41, created: true } });
      }
      if (url.includes("/api/offer-reports")) {
        return okJson({ success: true, data: { id: 42 } });
      }
      return okJson({ success: true, data: {} });
    }) as unknown as typeof fetch);

    const result = await evaluateOffer.handler({
      company: "IncompleteCo",
      role: "Product Manager",
      monthlySalary: 20,
    });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("offer_evaluation");
    const report = (result.rawData as { report: ReturnType<typeof evaluateOfferSnapshot> }).report;
    expect(report.missingInfo.length).toBeGreaterThan(0);

    const reportCall = calls.find((call) => call.url.includes("/api/offer-reports"));
    expect(reportCall).toBeTruthy();
    const body = JSON.parse(String(reportCall?.init?.body || "{}"));
    expect(body.report_type).toBe("single");
    expect(body.missing_info_json.length).toBeGreaterThan(0);
    expect(body.offer_snapshot.company).toBe("IncompleteCo");
  });

  it("changes tax risk output for full-salary vs minimum-base social insurance", () => {
    const fullBase = evaluateOfferSnapshot({
      ...completeOffer,
      socialInsuranceBaseType: "full_salary",
      housingFundRate: 12,
    });
    const minimumBase = evaluateOfferSnapshot({
      ...completeOffer,
      socialInsuranceBaseType: "minimum_base",
      housingFundRate: 5,
    });

    const fullTax = moduleById(fullBase, "tax");
    const minimumTax = moduleById(minimumBase, "tax");

    expect(minimumTax.score).toBeLessThan(fullTax.score);
    expect(minimumTax.risks.length).toBeGreaterThan(fullTax.risks.length);
    expect(minimumBase.redFlags.length).toBeGreaterThan(fullBase.redFlags.length);
  });

  it("changes employment-risk output for direct hire vs outsourcing or dispatch", () => {
    const direct = evaluateOfferSnapshot({ ...completeOffer, employmentForm: "direct_hire" });
    const outsourcing = evaluateOfferSnapshot({ ...completeOffer, employmentForm: "outsourcing" });
    const dispatch = evaluateOfferSnapshot({ ...completeOffer, employmentForm: "dispatch" });

    expect(moduleById(outsourcing, "benefits").score).toBeLessThan(moduleById(direct, "benefits").score);
    expect(moduleById(dispatch, "stability").risks.length).toBeGreaterThan(moduleById(direct, "stability").risks.length);
    expect(outsourcing.redFlags.length).toBeGreaterThan(direct.redFlags.length);
  });

  it("treats variable-only bonus as uncertain unless guarantee wording exists", () => {
    const uncertain = evaluateOfferSnapshot({
      ...completeOffer,
      annualBonus: 4,
      bonusGuarantee: "unknown",
    });
    const guaranteed = evaluateOfferSnapshot({
      ...completeOffer,
      annualBonus: 4,
      bonusGuarantee: "guaranteed",
    });

    const uncertainBonus = moduleById(uncertain, "bonus_equity");
    const guaranteedBonus = moduleById(guaranteed, "bonus_equity");

    expect(uncertainBonus.score).toBeLessThan(guaranteedBonus.score);
    expect(uncertainBonus.risks.length).toBeGreaterThan(guaranteedBonus.risks.length);
    expect(uncertain.missingInfo.length).toBeGreaterThan(guaranteed.missingInfo.length);
  });

  it("keeps a saved report snapshot unchanged after the source offer is edited", () => {
    const originalSnapshot = normalizeOfferSnapshot({
      ...completeOffer,
      monthlySalary: 25,
      monthsPerYear: 13,
    });
    const savedReport = evaluateOfferSnapshot(originalSnapshot);
    const savedRecord = {
      offer_id: savedReport.offerId,
      offer_snapshot_json: JSON.stringify(savedReport.offerSnapshot),
    };

    const editedOffer = normalizeOfferSnapshot({
      ...completeOffer,
      monthlySalary: 40,
      monthsPerYear: 15,
    });
    const restoredSnapshot = JSON.parse(savedRecord.offer_snapshot_json) as OfferSnapshot;

    expect(editedOffer.monthlySalary).toBe(40);
    expect(restoredSnapshot.monthlySalary).toBe(25);
    expect(restoredSnapshot.monthsPerYear).toBe(13);
    expect(savedReport.offerSnapshot.monthlySalary).toBe(25);
  });
});
