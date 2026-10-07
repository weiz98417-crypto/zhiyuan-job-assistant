import { describe, expect, it, vi } from "vitest";
import { admitScheduledDigestRun } from "@/lib/agent/run-admission";
import { createTaskProgramStopGuard, getTaskProgram } from "@/lib/agent/task-program";
import { getTaskContractPolicy, getToolGovernance } from "@/lib/agent/tool-governance";
import { buildJobDigestMaterial, opportunityFingerprint } from "@/lib/agent/tools/query/get-job-digest";

vi.mock("@/lib/scan-data", () => ({
  getScanJobsForUser: vi.fn(async () => ({
    jobs: [
      { id: 1, title: "前端工程师", company: "阿里巴巴", url: "https://www.zhipin.com/job/1?a=1", dedup_key: "https://www.zhipin.com/job/1", status: "new", discovered_at: "2026-09-29T02:00:00Z" },
      { id: 2, title: "前端工程师", company: "阿里巴巴", url: "https://www.zhipin.com/job/1?b=2", dedup_key: "https://www.zhipin.com/job/1", status: "new", discovered_at: "2026-09-29T03:00:00Z" },
      { id: 3, title: "产品经理", company: "字节跳动", url: "https://www.liepin.com/job/9", dedup_key: "https://www.liepin.com/job/9", status: "new", discovered_at: "2026-09-30T02:00:00Z" },
    ],
    total: 3,
    page: 1,
  })),
}));

describe("Spec 19: job_digest program, contract and governance", () => {
  it("registers a deterministic program without a clarify stage", () => {
    const program = getTaskProgram("job_digest");
    expect(program.executionDepth).toBe("deterministic");
    expect(program.stages).not.toContain("clarify_or_gate");
    // 两条 stop-guard 判据都可由 get_job_digest 的工具结果标记；digest 落库由 worker
    // 单写者结构性保证（ADR-0030/0036），不设不可标记的判据（评审修复）。
    expect(program.successCriteria).toEqual([
      "opportunity pool read since watermark",
      "digest summary generated (top opportunities with dedup note)",
    ]);
    expect(createTaskProgramStopGuard("job_digest")).not.toBeNull();
  });

  it("runs under a read-only contract policy", () => {
    expect(getTaskContractPolicy("job_digest")).toBe("read_only");
  });

  it("admits the scheduled digest run with a read-only tool allowlist", () => {
    const admission = admitScheduledDigestRun();
    expect(admission.kind).toBe("start_new_run");
    expect(admission.taskType).toBe("job_digest");
    expect(admission.contract?.routing?.allowedTools).toEqual(["get_job_digest"]);
    expect(admission.contract?.requiresUserApproval).toBe(false);
  });

  it("keeps the digest tool read-only and scoped to the digest task", () => {
    const governance = getToolGovernance("get_job_digest");
    expect(governance?.effect).toBe("read");
    expect(governance?.requiresUserConfirmation).toBe(false);
    expect(governance?.allowedTaskTypes).toEqual(["job_digest"]);
  });
});

describe("Spec 19: digest material with dedup notes", () => {
  it("reads the opportunity pool and surfaces duplicate fingerprints", async () => {
    const material = await buildJobDigestMaterial("user-1", "2026-09-28T00:00:00Z", "调度备注：上周失败");
    expect(material.totalNew).toBe(3);
    expect(material.opportunities).toHaveLength(3);
    const duplicated = material.duplicates.find((entry) => entry.fingerprint === "https://www.zhipin.com/job/1");
    expect(duplicated?.count).toBe(2);
    expect(material.schedulerNote).toBe("调度备注：上周失败");
  });

  it("normalizes the job fingerprint from dedup_key then url", () => {
    expect(opportunityFingerprint({ dedup_key: "HTTPS://EXAMPLE.COM/Job" })).toBe("https://example.com/job");
    expect(opportunityFingerprint({ url: "https://example.com/job?tracking=1#top" })).toBe("https://example.com/job");
    expect(opportunityFingerprint({ company: "A", title: "B" })).toBe("a::b");
  });
});
