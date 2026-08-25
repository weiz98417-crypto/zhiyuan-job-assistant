import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateReportMetadataForUser } = vi.hoisted(() => ({
  updateReportMetadataForUser: vi.fn(),
}));

vi.mock("@/lib/server/report-metadata-service", () => ({ updateReportMetadataForUser }));

import { updateReportMetadata } from "@/lib/agent/tools/action/update-report-metadata";

describe("update_report_metadata server execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTP must not be used"));
  });

  it("updates and verifies a user-owned report without localhost HTTP", async () => {
    updateReportMetadataForUser.mockResolvedValue({
      report_num: 12,
      company: "纸鸢科技",
      role: "高级产品经理",
      keywords_json: "[\"AI\",\"产品\"]",
      readBackVerified: true,
      changed: ["company=纸鸢科技", "keywords=AI, 产品"],
    });

    const result = await updateReportMetadata.handler(
      { reportNum: 12, company: "纸鸢科技", keywords: ["AI", "产品"] },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["update_report_metadata"],
      },
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(updateReportMetadataForUser).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ reportNum: 12, company: "纸鸢科技", keywords: ["AI", "产品"] }),
    );
    expect(result).toMatchObject({ success: true, data: { readBackVerified: true } });
  });
});
