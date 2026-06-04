import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { enforceToolPolicy } from "@/lib/agent/loop/tool-policy";
import { classifyIntent } from "@/lib/agent/registry";
import { offerAgent } from "@/lib/agent/registry/agents/offer-agent";
import { compareOffersDeep } from "@/lib/agent/tools/action/compare-offers-deep";
import { evaluateOffer } from "@/lib/agent/tools/action/evaluate-offer";
import { generateOfferHRQuestionList } from "@/lib/agent/tools/action/generate-offer-hr-question-list";
import { generateOfferNegotiationStrategy } from "@/lib/agent/tools/action/generate-offer-negotiation-strategy";
import { readOfferReport } from "@/lib/agent/tools/query/read-offer-report";

const reportRow = {
  id: 7,
  report_type: "single",
  model_version: "cn-single-offer-v1",
  offer_id: 3,
  overall_score: 3.8,
  verdict: "accept_after_negotiation",
  summary: "薪资不错，但社保、公积金和年终兑现需要确认。",
  offer_snapshot_json: JSON.stringify({
    offerId: 3,
    company: "字节跳动",
    role: "AI 产品经理",
    monthlySalary: 30,
    monthsPerYear: 15,
    hasSocialInsurance: true,
    housingFundRate: 7,
    probationMonths: 3,
  }),
  modules_json: JSON.stringify([]),
  red_flags_json: JSON.stringify(["年终兑现不确定"]),
  missing_info_json: JSON.stringify(["社保缴纳基数", "奖金兑现规则"]),
  negotiation_levers_json: JSON.stringify(["争取 12% 公积金", "争取年终保底"]),
  hr_questions_json: JSON.stringify(["五险一金按什么基数缴纳？"]),
  assumptions_json: JSON.stringify([]),
  take_home_json: JSON.stringify({ monthlyNetMin: 24, monthlyNetMax: 26 }),
  created_at: "2026-05-25T12:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Offer Agent routing and tool contracts", () => {
  it("routes single-offer evaluation language to the Offer Agent", () => {
    expect(classifyIntent("这个 offer 值不值得接？").id).toBe("offer");
    expect(classifyIntent("帮我看看这个 offer 值不值").id).toBe("offer");
    expect(offerAgent.toolNames).toContain("evaluate_offer");
    expect(offerAgent.toolNames).toContain("read_offer_report");
    expect(offerAgent.toolNames).toContain("generate_offer_negotiation_strategy");
    expect(offerAgent.toolNames).toContain("generate_offer_hr_question_list");
  });

  it("routes negotiation and HR-question language to the Offer Agent tool set", () => {
    expect(classifyIntent("那这个 offer 怎么跟 HR 谈？").id).toBe("offer");
    expect(classifyIntent("这份 offer 需要问 HR 什么？").id).toBe("offer");
    expect(offerAgent.toolNames).toEqual(expect.arrayContaining([
      "read_offer_report",
      "generate_offer_negotiation_strategy",
      "generate_offer_hr_question_list",
    ]));
  });

  it("allows explicit external research but blocks vague company questions in Offer mode", () => {
    expect(offerAgent.toolNames).toContain("web_search");
    const vague = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节跳动 公司背景" },
      messages: [{ role: "user", content: "这家公司怎么样？" }],
      toolWhitelist: offerAgent.toolNames,
    });
    expect(vague?.success).toBe(false);

    const explicit = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节跳动 公司背景" },
      messages: [{ role: "user", content: "查一下这家公司背景怎么样" }],
      toolWhitelist: offerAgent.toolNames,
    });
    expect(explicit).toBeNull();
  });

  it("evaluate_offer returns layered output and keeps full report in rawData", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/offers")) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 3, created: true } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { id: 11 } }),
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateOffer.handler({
      company: "字节跳动",
      role: "AI 产品经理",
      monthlySalary: 30,
      monthsPerYear: 15,
      annualBonus: 0,
      hasSocialInsurance: true,
      housingFundRate: 7,
      probationMonths: 3,
    });

    expect(result.success).toBe(true);
    expect(result.llmSummary).toContain("Offer");
    expect(result.uiPayload?.type).toBe("offer_evaluation");
    expect(result.uiPayload?.reportId).toBe(11);
    expect(result.uiPayload?.offerId).toBe(3);
    expect(result.rawData).toBeTruthy();
    expect(JSON.stringify(result.uiPayload).length).toBeLessThan(JSON.stringify(result.rawData).length);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/offers"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/offer-reports"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"offer_id":3'),
      }),
    );
  });

  it("evaluate_offer accepts an Offer screenshot and extracts it before evaluating", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/agent/image-intake")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              documentType: "offer",
              confidence: 0.9,
              extractedText: "公司：腾讯\n岗位：产品经理\n薪资：30K * 15\n试用期：3个月",
              structured: { company: "腾讯", role: "产品经理", monthlySalary: 30, monthsPerYear: 15 },
            },
          }),
        };
      }
      if (url.includes("/api/offers")) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 9, created: true } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { id: 19 } }),
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateOffer.handler({
      images: ["data:image/png;base64,abc"],
    });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.company).toBe("腾讯");
    expect(result.uiPayload?.role).toBe("产品经理");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/agent/image-intake"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"preferredDocumentType":"offer"'),
      }),
    );
  });

  it("compare_offers_deep rejects a single offer instead of silently evaluating it", async () => {
    const result = await compareOffersDeep.handler({
      offers: [{ company: "字节跳动", role: "AI 产品经理", monthlySalary: 30 }],
    });

    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe("need_user_input");
    expect(result.llmSummary).toContain("evaluate_offer");
  });

  it("compare_offers_deep does not compare when saved offer ids cannot both resolve", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/offers/1")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 1, company: "A 公司", role: "产品经理", monthly_salary: 20, months_per_year: 14 },
          }),
        };
      }
      return { ok: false, json: async () => ({ success: false }) };
    }) as unknown as typeof fetch);

    const result = await compareOffersDeep.handler({ offerIds: [1, 2] });

    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe("need_user_input");
    expect(result.error).toContain("至少需要 2 个");
  });

  it("read_offer_report returns concise LLM summary plus structured UI payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: reportRow }),
    })) as unknown as typeof fetch);

    const result = await readOfferReport.handler({ offerReportId: 7 });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("offer_report");
    expect(result.rawData).toMatchObject({ id: 7, offerId: 3 });
    expect(result.llmSummary?.length).toBeLessThan(400);
  });

  it("negotiation strategy consumes a saved report and does not call evaluate_offer", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: reportRow }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOfferNegotiationStrategy.handler({ offerReportId: 7 });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("offer_negotiation_strategy");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain("/api/offer-reports/7");
  });

  it("HR question tool prioritizes saved report missing info and red flags", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: reportRow }),
    })) as unknown as typeof fetch);

    const result = await generateOfferHRQuestionList.handler({ offerReportId: 7 });
    const questions = (result.rawData as { priorityQuestions: string[]; sourceMissingInfo: string[]; sourceRedFlags: string[] });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("offer_hr_question_list");
    expect(questions.sourceMissingInfo).toContain("社保缴纳基数");
    expect(questions.sourceRedFlags).toContain("年终兑现不确定");
    expect(questions.priorityQuestions.length).toBeGreaterThan(0);
  });

  it("Offer workspace source keeps report, stale badge, and Agent handoff boundaries", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/compare/page.tsx"), "utf-8");

    expect(source).toContain("/api/offers");
    expect(source).toContain("/api/offer-reports");
    expect(source).toContain("intent=evaluate");
    expect(source).toContain("intent=negotiate");
    expect(source).toContain("intent=ask_hr");
    expect(source).toContain("stale");
    expect(source).toContain("statusForOffer");
    expect(source).toContain("reportForOffer");
    expect(source).toContain("offerForComparison");
    expect(source).toContain("编辑 Offer");
    expect(source).toContain("method: editingOfferId ? \"PUT\" : \"POST\"");
  });
});
