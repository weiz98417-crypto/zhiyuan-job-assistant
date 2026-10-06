/** spec 33:感知指标查询视图(summary)路由契约——鉴权、Postgres-only、聚合形状、metric 白名单过滤。 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, getCurrentUserMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
  verifyTokenVersion: vi.fn(async () => true),
}));

vi.mock("@/lib/postgres", () => ({
  getDatabaseDriver: vi.fn(() => "postgres"),
  isPostgresConfigured: vi.fn(() => true),
  getPostgresPool: vi.fn(() => ({ query: queryMock })),
}));

import { GET } from "@/app/api/perception-events/summary/route";

beforeEach(() => {
  queryMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ userId: "u1" });
  queryMock.mockResolvedValue({ rows: [] });
});

describe("perception summary 路由(spec 33)", () => {
  it("聚合四指标:totals 缺失 metric 补 0,daily 原样透传", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ metric: "score_evidence_expand", count: 7 }] })
      .mockResolvedValueOnce({ rows: [{ metric: "score_evidence_expand", day: "2026-10-01", count: 3 }] });
    const res = GET();
    const body = await (await res).json();
    expect(body.success).toBe(true);
    expect(body.data.totals).toEqual({
      fact_gate_repair: 0,
      score_evidence_expand: 7,
      sourced_jd_follow_through: 0,
      question_source_followup: 0,
    });
    expect(body.data.daily).toEqual([{ day: "2026-10-01", metric: "score_evidence_expand", count: 3 }]);
  });

  it("未知 metric(不在白名单)不出现在响应", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ metric: "rogue_metric", count: 99 }] })
      .mockResolvedValueOnce({ rows: [] });
    const body = await (await GET()).json();
    expect(body.data.totals.rogue_metric).toBeUndefined();
    expect(body.data.daily).toEqual([]);
  });

  it("非 Postgres 模式 → 503 unavailable", async () => {
    const pg = await import("@/lib/postgres");
    vi.mocked(pg.getDatabaseDriver).mockReturnValue("sqlite");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
