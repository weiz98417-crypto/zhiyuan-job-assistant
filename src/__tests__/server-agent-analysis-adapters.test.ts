import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  scanJDRisks: vi.fn(),
  decodeJDRiskTerms: vi.fn(),
  fetchJDTextFromUrl: vi.fn(),
  analyzeATSResume: vi.fn(),
}));

vi.mock("@/lib/server/jd-risk-service", () => ({
  scanJDRisks: boundaries.scanJDRisks,
  decodeJDRiskTerms: boundaries.decodeJDRiskTerms,
}));
vi.mock("@/lib/server/durable-jd-evaluation", () => ({
  fetchJDTextFromUrl: boundaries.fetchJDTextFromUrl,
}));
vi.mock("@/lib/server/ats-analysis-service", () => ({
  analyzeATSResume: boundaries.analyzeATSResume,
}));

import { analyzeJDRisks } from "@/lib/agent/tools/action/analyze-jd-risks";
import { decodeBlackMarketTerms } from "@/lib/agent/tools/query/decode-terms";
import { fetchJDContent } from "@/lib/agent/tools/action/fetch-jd-content";
import { checkATS } from "@/lib/agent/tools/query/ats-check";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["analyze_jd_risks", "decode_black_market_terms", "fetch_jd_content", "check_ats_compatibility"],
};

describe("server analysis adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("uses the in-process risk scanner and dictionary", async () => {
    boundaries.scanJDRisks.mockReturnValue([{ signal: "违规收费", excerpt: "培训费", severity: "critical" }]);
    boundaries.decodeJDRiskTerms.mockReturnValue([{ term: "弹性工作制", meaning: "加班风险", severity: "medium" }]);
    const risks = await analyzeJDRisks.handler({ jd_text: "岗位职责与任职要求，明确收取培训费。".repeat(3) }, context);
    const terms = await decodeBlackMarketTerms.handler({ text: "弹性工作制" }, context);
    expect(risks.success).toBe(true);
    expect(terms.success).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uses cancellable server adapters for JD URLs and ATS analysis", async () => {
    boundaries.fetchJDTextFromUrl.mockResolvedValue("完整 JD 正文");
    boundaries.analyzeATSResume.mockResolvedValue({ issues: [], score: 92 });
    const fetched = await fetchJDContent.handler({ url: "https://example.com/job" }, context);
    const ats = await checkATS.handler({ cv_text: "完整简历".repeat(20) }, context);
    expect(fetched).toMatchObject({ success: true, data: { text: "完整 JD 正文" } });
    expect(ats).toMatchObject({ success: true, data: { score: 92 } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
