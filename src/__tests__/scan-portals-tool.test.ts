import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getReadBackRequirementStatus } from "@/lib/agent/tools/readback-verification";
import { scanPortals } from "@/lib/agent/tools/action/scan-portals";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("treats the confirmation card as a non-mutating gated response", async () => {
    const result = await scanPortals.handler({
      query: "找一下杭州的AI产品经理岗位",
      titleKeywords: ["AI 产品经理"],
      location: "杭州",
    });
    const readBackRequirement = getReadBackRequirementStatus("scan_portals", result);

    expect(result.success).toBe(true);
    expect(result.uiPayload?.type).toBe("job_discovery_confirmation");
    expect(result.rawData?.createdScan).toBe(false);
    expect(readBackRequirement).toMatchObject({ required: false, satisfied: true });
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

  it("returns read-back verification evidence after confirmed scan creation", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === "/api/scan") {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
        expect(body.confirmed).toBe(true);
        expect(body.location).toBe("杭州");
        return new Response(JSON.stringify({ scanId: "scan-confirmed-1", companiesTotal: 8 }), { status: 201 });
      }
      if (href === "/api/scan/status?scanId=scan-confirmed-1") {
        return new Response(JSON.stringify({
          data: {
            scanId: "scan-confirmed-1",
            status: "pending",
            companiesDone: 0,
            companiesTotal: 8,
            jobsFound: 0,
            jobsNew: 0,
            createdAt: "2026-07-03T00:00:00.000Z",
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected fetch" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scanPortals.handler({
      query: "确认开始岗位发现：岗位关键词 AI 产品经理，地点 杭州，数量上限 50",
      titleKeywords: ["AI 产品经理"],
      location: "杭州",
      maxResults: 50,
      confirmed: true,
    });
    const readBackRequirement = getReadBackRequirementStatus("scan_portals", result);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ scanId: "scan-confirmed-1", readBackVerified: true });
    expect(result.uiPayload).toMatchObject({
      type: "job_discovery_run",
      scanId: "scan-confirmed-1",
      readBackVerified: true,
    });
    expect(result.rawData).toMatchObject({ readBackVerified: true });
    expect(readBackRequirement).toMatchObject({ required: true, satisfied: true });
  });
});
