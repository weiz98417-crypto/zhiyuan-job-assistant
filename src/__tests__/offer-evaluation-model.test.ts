import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfferSnapshot } from "@/types";
import { calculateOfferCash, evaluateOfferSnapshot, normalizeOfferSnapshot } from "@/lib/offer-evaluation";
import { evaluateOffer } from "@/lib/agent/tools/action/evaluate-offer";
import { offerBonusGuaranteeFromText, offerSocialInsuranceFromText } from "@/lib/offer-conditions";

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
  it.each(["不保证年终奖", "不保底奖金", "年终奖不保证", "年终奖不是保证收入", "奖金不一定发放", "无保证奖金"])("never treats negated bonus terms as guaranteed cash: %s", (text) => {
    const bonusGuarantee = offerBonusGuaranteeFromText(text);
    expect(bonusGuarantee).toBe("uncertain");
    const report = evaluateOfferSnapshot({ ...completeOffer, monthlySalary: 20, monthsPerYear: 12, annualBonus: 2, bonusGuarantee });
    expect(calculateOfferCash(report.offerSnapshot)).toEqual({ guaranteedAnnualK: 240, variableBonusK: 40 });
  });

  it.each(["没有社保", "不提供五险一金", "不缴纳社保"])("does not turn negated insurance into a known benefit: %s", (text) => {
    expect(offerSocialInsuranceFromText(text, undefined)).toBe(false);
  });

  it("keeps absent benefits unknown in the saved offer and report while disclosing estimate assumptions", async () => {
    const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") writes.push({ url, body: JSON.parse(String(init.body)) });
      if (url.includes("/api/offers")) return okJson({ success: true, data: { id: 41, readBackVerified: true } });
      if (url.includes("/api/offer-reports")) return okJson({ success: true, data: { id: 42, readBackVerified: true, linkedOfferReadBackVerified: true } });
      return okJson({ success: false });
    }) as unknown as typeof fetch);
    const result = await evaluateOffer.handler({ offerText: "公司：Acme\n岗位：产品经理\n月薪20K，12薪" });
    expect(result.success).toBe(true);
    expect(writes.find((write) => write.url.includes("/api/offers"))?.body).toMatchObject({
      has_social_insurance: null, housing_fund_rate: null, probation_months: null, annual_bonus: null,
    });
    const report = (result.rawData as { report: ReturnType<typeof evaluateOfferSnapshot> }).report;
    expect(report.offerSnapshot).toMatchObject({ hasSocialInsurance: null, housingFundRate: null, probationMonths: null });
    expect(report.missingInfo).toEqual(expect.arrayContaining(["社保缴纳情况", "公积金比例", "试用期"]));
    expect(report.modules.find((module) => module.id === "tax")?.evidence).toContain("社保缴纳情况未明确");
    expect(report.takeHomeEstimate?.assumptions.join(" ")).toContain("假设");
  });

  it("saves a preliminary report for incomplete offers and exposes missing-info items", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/agent/memory-context")) {
        return okJson({ success: false });
      }
      if (url.includes("/api/offers")) {
        return okJson({ success: true, data: { id: 41, created: true, readBackVerified: true } });
      }
      if (url.includes("/api/offer-reports")) {
        return okJson({ success: true, data: { id: 42, readBackVerified: true, linkedOfferReadBackVerified: true } });
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

  it("excludes non-guaranteed bonus from known annual cash and the annual net estimate", () => {
    const uncertain = evaluateOfferSnapshot({ ...completeOffer, monthlySalary: 20, monthsPerYear: 12, annualBonus: 4, bonusGuarantee: "uncertain" });
    const noBonus = evaluateOfferSnapshot({ ...completeOffer, monthlySalary: 20, monthsPerYear: 12, annualBonus: 0, bonusGuarantee: "none" });
    const guaranteed = evaluateOfferSnapshot({ ...completeOffer, monthlySalary: 20, monthsPerYear: 12, annualBonus: 4, bonusGuarantee: "guaranteed" });
    expect(calculateOfferCash(uncertain.offerSnapshot)).toEqual({ guaranteedAnnualK: 240, variableBonusK: 80 });
    expect(calculateOfferCash(guaranteed.offerSnapshot)).toEqual({ guaranteedAnnualK: 320, variableBonusK: 0 });
    expect(calculateOfferCash({ ...noBonus.offerSnapshot, annualBonus: null })).toEqual({ guaranteedAnnualK: 240, variableBonusK: null });
    expect(uncertain.takeHomeEstimate?.annualNetMin).toBe(noBonus.takeHomeEstimate?.annualNetMin);
    expect(uncertain.takeHomeEstimate?.annualNetMax).toBe(noBonus.takeHomeEstimate?.annualNetMax);
    expect(moduleById(uncertain, "cash").evidence).toContain("确定年现金 240K");
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
