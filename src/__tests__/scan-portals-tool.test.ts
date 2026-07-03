import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanPortals } from "@/lib/agent/tools/action/scan-portals";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("scan_portals job discovery tool", () => {
  it("returns a confirmation payload without creating a scan when not confirmed", async () => {
    const result = await scanPortals.handler({
      query: "上海 AI 产品经理",
      location: "上海",
      maxResults: 20,
    });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("job_discovery_confirmation");
    expect(result.data).toMatchObject({ needsConfirmation: true });
    expect(result.llmSummary).toContain("不要创建 scan_queue");
  });

  it("labels profile-derived criteria in the confirmation payload", async () => {
    const result = await scanPortals.handler({
      titleKeywords: ["AI 产品经理"],
      location: "上海",
      profileDerived: [
        { field: "titleKeywords", label: "目标岗位", value: "AI 产品经理" },
        { field: "location", label: "城市偏好", value: "上海" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("job_discovery_confirmation");
    expect(result.uiPayload?.profileDerived).toEqual([
      { field: "titleKeywords", label: "目标岗位", value: "AI 产品经理" },
      { field: "location", label: "城市偏好", value: "上海" },
    ]);
    expect(result.rawData?.createdScan).toBe(false);
  });

  it("uses current opportunity pool for change-batch requests instead of creating a new scan", async () => {
    const result = await scanPortals.handler({
      query: "换一批",
      existingJobs: [
        { id: 1, title: "A" },
        { id: 2, title: "B" },
        { id: 3, title: "C" },
      ],
      offset: 1,
    });

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("job_discovery_batch");
    expect(result.uiPayload?.jobs).toEqual([{ id: 2, title: "B" }, { id: 3, title: "C" }]);
    expect(result.data).toMatchObject({ createdScan: false, offset: 1, returned: 2 });
    expect(result.llmSummary).toContain("不要创建新的 scan_queue");
  });

  it("does not use /api/scan/status POST as the trigger path", () => {
    const tool = source("src/lib/agent/tools/action/scan-portals.ts");
    const api = source("src/app/api/scan/route.ts");

    expect(tool).toContain("/api/scan");
    expect(tool).toContain("/api/scan/status?scanId=");
    expect(tool).not.toContain('fetch("/api/scan/status", {');
    expect(api).toContain("startJobDiscoveryRunForUser");
  });
});
