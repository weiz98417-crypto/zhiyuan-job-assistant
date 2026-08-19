import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCVData } from "@/lib/cv-storage";
import { stableContentHash } from "@/lib/agent/verified-action";
import type { CVData } from "@/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CV browser persistence", () => {
  it("sends a base snapshot and caches only the server read-back", async () => {
    const baseData: CVData = {
      activeVersion: "v3",
      versions: {
        v3: {
          id: "v3",
          label: "当前版本",
          createdAt: "2026-08-19T00:00:00.000Z",
          source: "manual",
          sections: [{ id: "skills", title: "技能", content: "旧技能" }],
        },
      },
    };
    const updated: CVData = JSON.parse(JSON.stringify(baseData));
    updated.versions.v3.sections[0].content = "新技能：Agent 评测与产品交付";
    const persisted: CVData = JSON.parse(JSON.stringify(updated));
    persisted.versions.v3.label = "服务端读回版本";
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: updated }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: persisted }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveCVData(updated, baseData);
    const writeBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(writeBody).toMatchObject({
      data: updated,
      expectedActiveVersion: "v3",
      expectedBaseHash: stableContentHash(baseData.versions.v3),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/cv/data", { cache: "no-store" });
    expect(result.versions.v3.label).toBe("服务端读回版本");
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual(persisted);
  });
});
