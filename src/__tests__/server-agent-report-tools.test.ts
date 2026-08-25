import { beforeEach, describe, expect, it, vi } from "vitest";

const { getReport, getOfferReport, listReports } = vi.hoisted(() => ({
  getReport: vi.fn(),
  getOfferReport: vi.fn(),
  listReports: vi.fn(),
}));

vi.mock("@/lib/agent/runtime/agent-read-service", () => ({
  getAgentReadService: () => ({ getReport, getOfferReport, listReports }),
}));

import { getReportDetail } from "@/lib/agent/tools/query/get-report-detail";
import { readOfferReport } from "@/lib/agent/tools/query/read-offer-report";

describe("server Agent report tools", () => {
  beforeEach(() => {
    getReport.mockReset();
    getOfferReport.mockReset();
    listReports.mockReset();
    vi.unstubAllGlobals();
  });

  it("lists reports through the execution principal", async () => {
    listReports.mockResolvedValue([
      {
        report_num: 12,
        company: "甲公司",
        role: "AI 产品经理",
        date: "2026-08-24",
        overall_score: 4.5,
      },
    ]);
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await getReportDetail.handler(
      { list: true },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_report_detail"],
      },
    );

    expect(result).toMatchObject({ success: true, errorCategory: "ok" });
    expect(result.llmSummary).toContain("甲公司");
    expect(listReports).toHaveBeenCalledWith({ userId: "user-1" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads report detail through the execution principal", async () => {
    getReport.mockResolvedValue({
      report_num: 12,
      company: "甲公司",
      role: "AI 产品经理",
      date: "2026-08-24",
      overall_score: 4.5,
      archetype: "builder",
      blocks_json: JSON.stringify({ a: { content: "负责 Agent 产品", score: 4 } }),
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await getReportDetail.handler(
      { reportNum: 12 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_report_detail"],
      },
    );

    expect(result).toMatchObject({ success: true, errorCategory: "ok" });
    expect(result.llmSummary).toContain("负责 Agent 产品");
    expect(getReport).toHaveBeenCalledWith({ userId: "user-1" }, 12);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads an Offer report through the execution principal", async () => {
    getOfferReport.mockResolvedValue({
      id: 7,
      report_type: "single",
      model_version: "v1",
      offer_id: 3,
      overall_score: 4.2,
      verdict: "accept",
      summary: "值得推进",
      offer_snapshot_json: JSON.stringify({ company: "甲公司", role: "AI 产品经理" }),
      modules_json: "[]",
      red_flags_json: JSON.stringify(["年终不确定"]),
      missing_info_json: JSON.stringify(["社保基数"]),
      negotiation_levers_json: "[]",
      hr_questions_json: "[]",
      assumptions_json: "[]",
      take_home_json: "{}",
      created_at: "2026-08-24T10:00:00.000Z",
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call localhost HTTP");
    }));

    const result = await readOfferReport.handler(
      { offerReportId: 7 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["read_offer_report"],
      },
    );

    expect(result).toMatchObject({
      success: true,
      errorCategory: "ok",
      uiPayload: { type: "offer_report", reportId: 7 },
    });
    expect(getOfferReport).toHaveBeenCalledWith({ userId: "user-1" }, 7);
    expect(fetch).not.toHaveBeenCalled();
  });
});
