import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeDedupKey } from "../../lib/scan/orchestrator.mjs";
import { classifyIntentHardRule } from "@/lib/agent/classify-intent-llm";
import { routeAgentTask } from "@/lib/agent/task-routing";
import { createAgentTaskContract, inferCompletedCriteriaFromToolResult } from "@/lib/agent/task-contract";
import { scanPortals } from "@/lib/agent/tools/action/scan-portals";
import { getWeakDuplicateHintCounts, jobFingerprint, mergeJobDiscoveryItems } from "@/lib/job-discovery";

type ServerDbModule = typeof import("@/lib/server-db");

const TEST_USER_ID = "user-job-discovery-agent-evals";

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
}

async function loadDbHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-job-discovery-evals-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;
  serverDb = await import("@/lib/server-db");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "job-discovery-eval-user", "hash", "Job Discovery Eval User", "member", "active");
  return { db };
}

afterEach(() => {
  if (serverDb) {
    serverDb.getDb().close();
    serverDb = null;
  }
  vi.resetModules();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
  delete process.env.DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.ALLOW_SQLITE_LEGACY;
});

describe("job discovery agent evals - baseline", () => {
  it("B1 enters job discovery confirmation for clear requests", async () => {
    const decision = routeAgentTask({ agentId: "general", content: "帮我找上海 AI 产品经理岗位，扫一批 JD" });
    const result = await scanPortals.handler({ titleKeywords: ["AI 产品经理"], location: "上海" });

    expect(decision.taskType).toBe("job_search");
    expect(decision.requiresClarification).toBe(false);
    expect(result.uiPayload?.type).toBe("job_discovery_confirmation");
    expect(result.rawData?.createdScan).toBe(false);
  });

  it("B2 confirmation creates real scan_queue and returns read-back scanId", async () => {
    const { db } = await loadDbHarness();
    const { startJobDiscoveryRunForUser } = await import("@/lib/job-discovery-run");

    const result = await startJobDiscoveryRunForUser(TEST_USER_ID, { titleKeywords: ["AI 产品经理"], maxResults: 5 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.scanId).toBeTruthy();
    expect(result.readBack.scanId).toBe(result.scanId);
    const row = db.prepare("SELECT id, user_id, status FROM scan_queue WHERE id = ?").get(result.scanId) as { id: string; user_id: string; status: string };
    expect(row).toMatchObject({ id: result.scanId, user_id: TEST_USER_ID, status: "pending" });
  });

  it("B3 run card shows scan progress and issue summary affordance", () => {
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(chat).toContain("function JobDiscoveryRunCard");
    expect(chat).toContain("companiesDone");
    expect(chat).toContain("companiesTotal");
    expect(chat).toContain("jobsFound");
    expect(chat).toContain("jobsNew");
    expect(chat).toContain("/discover?scanId=");
  });

  it("B4 discovered jobs render as up to five result cards", () => {
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(chat).toContain("function JobDiscoveryBatchCard");
    expect(chat).toContain("jobs.slice(0, 5)");
  });

  it("B5 opening JD reuses the existing scan job JD fetch route", () => {
    const helper = source("src/lib/job-discovery.ts");
    const route = source("src/app/api/scan/jobs/[id]/jd/route.ts");

    expect(helper).toContain("fetchDiscoveryJobDetail");
    expect(helper).toContain("/api/scan/jobs/${job.id}/jd");
    expect(route).toContain("export async function GET");
    expect(route).toContain("markScanJobViewedForUser");
  });

  it("B6 evaluation saves or reuses JD and enters existing Agent evaluation flow", () => {
    const route = source("src/app/api/scan/jobs/[id]/jd/route.ts");
    const discover = source("src/app/discover/page.tsx");
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(route).toContain("attachJdToScanJobForUser");
    expect(route).toContain('body.evaluate ? "evaluating" : "saved"');
    expect(discover).toContain("getAgentEvaluationUrl(jdId)");
    expect(chat).toContain("getAgentEvaluationUrl(result.jdId)");
  });
});

describe("job discovery agent evals - boundary", () => {
  it("E1 vague requests do not silently create scans", () => {
    const decision = routeAgentTask({ agentId: "general", content: "帮我找岗位" });

    expect(decision.taskType).toBe("job_search");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.auditSummary).toBe("intent:job_search:needs_criteria");
  });

  it("E2 profile prefill is visible in the confirmation card", async () => {
    const result = await scanPortals.handler({
      titleKeywords: ["AI 产品经理"],
      profileDerived: [{ field: "titleKeywords", label: "目标岗位", value: "AI 产品经理" }],
    });
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(result.uiPayload?.profileDerived).toEqual([{ field: "titleKeywords", label: "目标岗位", value: "AI 产品经理" }]);
    expect(chat).toContain("这些条件来自你的求职画像");
  });

  it("E3 existing active scan is recovered, not duplicated", async () => {
    const { db } = await loadDbHarness();
    const { startJobDiscoveryRunForUser } = await import("@/lib/job-discovery-run");

    const first = await startJobDiscoveryRunForUser(TEST_USER_ID, { titleKeywords: ["AI 产品经理"] });
    const second = await startJobDiscoveryRunForUser(TEST_USER_ID, { titleKeywords: ["数据产品经理"] });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.conflict).toBe(true);
    expect(second.scanId).toBe(first.scanId);
    const count = db.prepare("SELECT COUNT(*) AS count FROM scan_queue WHERE user_id = ? AND status IN ('pending','running')").get(TEST_USER_ID) as { count: number };
    expect(count.count).toBe(1);
  });

  it("E4 discovered jobs do not automatically enter JD Library", async () => {
    const { db } = await loadDbHarness();
    const { startJobDiscoveryRunForUser } = await import("@/lib/job-discovery-run");

    const result = await startJobDiscoveryRunForUser(TEST_USER_ID, { titleKeywords: ["AI 产品经理"] });

    expect(result.success).toBe(true);
    const jdCount = db.prepare("SELECT COUNT(*) AS count FROM jds WHERE user_id = ?").get(TEST_USER_ID) as { count: number };
    expect(jdCount.count).toBe(0);
  });

  it("E5 Chat does not render all results when scan has more than five jobs", () => {
    expect(source("src/components/agent/AgentChat.tsx")).toContain("jobs.slice(0, 5)");
  });

  it("E6 weak duplicates are hinted, not blocked", () => {
    const jobs = [
      { id: 1, company: "Example", title: "AI Product Manager", location: "Shanghai", url: "https://jobs.example.com/1", status: "new" },
      { id: 2, company: "example", title: "AI Product Manager (Platform)", location: " Shanghai ", url: "https://jobs.example.com/2", status: "new" },
    ] as const;

    expect(mergeJobDiscoveryItems([...jobs]).map((job) => job.id)).toEqual([1, 2]);
    expect(getWeakDuplicateHintCounts([...jobs]).get(jobFingerprint(jobs[0]))).toBe(1);
  });

  it("E7 JD fetch failure cannot produce saved/evaluated success", () => {
    const route = source("src/app/api/scan/jobs/[id]/jd/route.ts");

    expect(route).toContain("if (jdBody.length < 50)");
    expect(route).toContain("updateScanJobErrorForUser");
    expect(route).toContain("{ status: 422 }");
  });

  it("E8 tool governance blocks unconfirmed scan writes", async () => {
    const result = await scanPortals.handler({ titleKeywords: ["AI 产品经理"] });

    expect(result.uiPayload?.type).toBe("job_discovery_confirmation");
    expect(result.rawData?.createdScan).toBe(false);
  });
});

describe("job discovery agent evals - regression", () => {
  it("R0 search requests are hard-routed away from JD evaluation", () => {
    const message = "找一下杭州的AI产品经理岗位";
    const intent = classifyIntentHardRule(message);
    const decision = routeAgentTask({ agentId: "evaluate", content: message });
    const page = source("src/app/agent/page.tsx");

    expect(intent?.agentId).toBe("general");
    expect(decision.taskType).toBe("job_search");
    expect(decision.allowedTools).toContain("scan_portals");
    expect(page.indexOf("let routeDecision = routeAgentTask")).toBeLessThan(page.indexOf("await orchestrate"));
    expect(page).toContain("const routeForcedAgentId = forcedAgentId || (routeDecision.taskType ? taskAgentId(routeDecision.taskType) : undefined)");
  });

  it("R0b job search forces scan_portals instead of allowing free-form chat", () => {
    const runner = source("src/lib/agent/loop/client-runner.ts");

    expect(runner).toContain('runtimeContext?.taskContract?.taskType === "job_search"');
    expect(runner).toContain('name: "scan_portals"');
    expect(runner).toContain("buildForcedJobSearchParams(latestUserText(ctx))");
    expect(runner).toContain('tc.name === "scan_portals" && toolResult.success');
    expect(runner).toContain("已生成岗位发现确认卡");
  });

  it("R0c job discovery cards satisfy the job_search contract gate", () => {
    const contract = createAgentTaskContract({
      taskType: "job_search",
      target: "找一下杭州的AI产品经理岗位",
    });

    const completed = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "scan_portals",
      toolSuccess: true,
      uiPayload: { type: "job_discovery_confirmation" },
    });

    expect(completed).toEqual([
      "job discovery criteria confirmed",
      "scan creation gated by user confirmation",
      "scan read-back or opportunity pool response returned",
    ]);
  });

  it("R1 URL variants do not duplicate in workbench or Chat", () => {
    const left = "https://jobs.example.com/job/123?utm_source=chat#detail";
    const right = "https://jobs.example.com/job/123/";

    expect(makeDedupKey(left)).toBe(makeDedupKey(right));
    expect(jobFingerprint({ id: 1, url: left })).toBe(jobFingerprint({ id: 2, url: right }));
  });

  it("R2 scan_portals does not regress to plain text count", async () => {
    const result = await scanPortals.handler({ titleKeywords: ["AI 产品经理"] });

    expect(result.uiPayload?.type).toBe("job_discovery_confirmation");
    expect(result.llmSummary).not.toMatch(/^\d+$/);
  });

  it("R3 Discover and Chat share scan job status/detail semantics", () => {
    const page = source("src/app/discover/page.tsx");
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(page).toContain("jobStatusBadge(job.status)");
    expect(page).toContain("fetchDiscoveryJobDetail(job)");
    expect(chat).toContain("fetchDiscoveryJobDetail({ id, company, title, url })");
  });

  it("R4 change-batch requests do not immediately create a new scan", async () => {
    const result = await scanPortals.handler({
      query: "换一批",
      existingJobs: [{ id: 1, title: "A" }, { id: 2, title: "B" }],
    });

    expect(result.uiPayload?.type).toBe("job_discovery_batch");
    expect(result.data).toMatchObject({ createdScan: false });
  });

  it("R5 dismissed jobs are hidden by default but available via filter", () => {
    const page = source("src/app/discover/page.tsx");
    const helper = source("src/lib/job-discovery.ts");

    expect(helper).toContain('["new", "viewed", "saved", "evaluating", "evaluated"]');
    expect(page).toContain("showDismissed ? [\"dismissed\"] : DISCOVERY_VISIBLE_STATUSES");
    expect(page).toContain("setShowDismissed(true)");
  });

  it("R6 evaluation writes back scan_jobs.jd_id", () => {
    expect(source("src/lib/scan-data.ts")).toContain("UPDATE scan_jobs SET jd_id");
  });

  it("R7 large error logs are summarized in Chat rather than rendered fully", () => {
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(chat).toContain("function JobDiscoveryErrorCard");
    expect(chat).not.toContain("errorLog.map");
  });

  it("R8 continuous job discovery remains out of MVP implementation", () => {
    const proposal = source("openspec/changes/agentify-job-discovery-workbench/proposal.md");
    const tasks = source("openspec/changes/agentify-job-discovery-workbench/tasks.md");

    expect(proposal).toContain("持续岗位发现");
    expect(tasks).toContain("Continuous job discovery remains out of MVP implementation");
  });
});
