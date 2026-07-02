import { describe, expect, it, vi } from "vitest";
import {
  buildPartialWriteEvalCandidate,
  upsertPartialWriteEvalCandidates,
} from "../../scripts/check-jd-eval-partials.mjs";

describe("JD evaluation partial-write eval candidates", () => {
  it("turns orphan JD reports into redacted partial_write eval candidates", () => {
    const candidate = buildPartialWriteEvalCandidate({
      report_num: 11,
      user_id: "user-secret",
      company: "深圳华启数智科技有限公司 sk-a0b9c1f642064a87bc2e4f4d8e79f6c3",
      role: "数据产品经理（地产/建筑行业方向）",
      candidate_jd_id: null,
    }, "postgres");

    const serialized = JSON.stringify(candidate);
    expect(candidate).toMatchObject({
      name: "jd_evaluation_partial_write_orphan_report",
      taskType: "jd_evaluation",
      failureType: "partial_write",
    });
    expect(candidate.inputSummary).toContain("Report #11");
    expect(candidate.expectedContract).toMatchObject({
      source: "jd_eval_partial_write_scan",
      mustNotRepeatFailure: "partial_write",
    });
    expect(candidate.fixture).toMatchObject({
      driver: "postgres",
      reportNum: 11,
      hasCandidateJd: false,
    });
    expect(candidate.dedupeKey).toMatch(/^jd_evaluation:partial_write:/);
    expect(serialized).not.toContain("sk-a0b9");
    expect(serialized).not.toContain("user-secret");
  });

  it("upserts candidates into the agent eval queue", async () => {
    const candidate = buildPartialWriteEvalCandidate({
      report_num: 9,
      user_id: "user-1",
      company: "深圳华启数智科技有限公司",
      role: "数据产品经理",
      candidate_jd_id: 3,
    }, "postgres");
    const query = vi.fn(async () => ({ rows: [{ id: 7 }] }));

    const saved = await upsertPartialWriteEvalCandidates({ query }, [candidate]);

    expect(saved).toBe(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO agent_eval_candidates"),
      expect.arrayContaining([
        null,
        null,
        "jd_evaluation_partial_write_orphan_report",
        "jd_evaluation",
        "partial_write",
      ]),
    );
  });
});
