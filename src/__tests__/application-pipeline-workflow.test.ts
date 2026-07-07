import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_USER_ID = "user-application-pipeline-evals";

let dataDir: string | null = null;
let serverDb: typeof import("@/lib/server-db") | null = null;
let dataRepositories: typeof import("@/lib/data-repositories") | null = null;
let workflow: typeof import("@/lib/application-workflow") | null = null;
let insights: typeof import("@/lib/team-insights") | null = null;

async function loadHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-pipeline-evals-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;
  serverDb = await import("@/lib/server-db");
  dataRepositories = await import("@/lib/data-repositories");
  workflow = await import("@/lib/application-workflow");
  insights = await import("@/lib/team-insights");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "pipeline-eval-user", "hash", "Pipeline Eval User", "admin", "active");
  return { db, workflow, insights };
}

beforeEach(async () => {
  await loadHarness();
});

afterEach(() => {
  if (serverDb) {
    serverDb.getDb().close();
    serverDb = null;
  }
  workflow = null;
  insights = null;
  dataRepositories = null;
  vi.resetModules();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
  delete process.env.DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.ALLOW_SQLITE_LEGACY;
});

describe("application Pipeline evals - baseline", () => {
  it("B1 trackApplication creates a server application with read-back event evidence", async () => {
    const result = await workflow!.trackApplication({
      company: "Acme AI",
      role: "AI Product Manager",
      score: 82,
      reportNum: 7,
      jdId: 4,
      sourceUrl: "https://jobs.example.com/acme-ai-pm",
      source: "agent_chat",
    }, TEST_USER_ID);

    expect(result).toMatchObject({ success: true, created: true });
    expect(result.data).toMatchObject({
      company: "Acme AI",
      role: "AI Product Manager",
      status: "evaluated",
      jd_id: 4,
      source_url: "https://jobs.example.com/acme-ai-pm",
    });
    expect(result.event).toMatchObject({ event_type: "tracked", to_status: "evaluated", source: "agent_chat" });
  });

  it("B2 updateApplicationStatus records applied status plus transition event", async () => {
    const tracked = await workflow!.trackApplication({ company: "Byte Lake", role: "AI PM" }, TEST_USER_ID);
    const updated = await workflow!.updateApplicationStatus({
      id: tracked.data!.id,
      status: "applied",
      note: "Applied from AgentChat",
      source: "agent_chat",
    }, TEST_USER_ID);

    expect(updated).toMatchObject({ success: true });
    expect(updated.data).toMatchObject({ id: tracked.data!.id, status: "applied" });
    expect(updated.event).toMatchObject({ event_type: "status_changed", from_status: "evaluated", to_status: "applied" });
  });

  it("B3 team insights returns Pipeline funnel fields from seeded Pipeline data", async () => {
    await workflow!.trackApplication({ company: "Acme AI", role: "AI PM", score: 88 }, TEST_USER_ID);
    await workflow!.trackApplication({ company: "Data Harbor", role: "Data PM", score: 72 }, TEST_USER_ID);
    await workflow!.updateApplicationStatus({ company: "Acme AI", role: "AI PM", status: "applied" }, TEST_USER_ID);
    const data = insights!.getTeamInsights(serverDb!.getDb());

    expect(data.pipelineFunnel.map((stage) => stage.stage)).toEqual([
      "discovered",
      "saved_jd",
      "evaluated",
      "tracked",
      "applied",
      "responded",
      "interview",
      "offer",
    ]);
    expect(data.pipelineFunnel.find((stage) => stage.stage === "tracked")?.count).toBe(2);
    expect(data.pipelineFunnel.find((stage) => stage.stage === "applied")?.count).toBe(1);
  });

  it("B4 tracker reload sees an application created through the AgentChat Pipeline path", async () => {
    const tracked = await workflow!.trackApplication({
      company: "Hangzhou Agent Co",
      role: "AI Product Manager",
      score: 91,
      jdId: 44,
      sourceUrl: "https://jobs.example.cn/hangzhou-agent-ai-pm",
      source: "agent_chat",
    }, TEST_USER_ID);
    const rows = await dataRepositories!.getDataRepositories().applications.list({ limit: 50 }, TEST_USER_ID);

    expect(tracked.success).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: tracked.data!.id,
      company: "Hangzhou Agent Co",
      role: "AI Product Manager",
      jd_id: 44,
      source_url: "https://jobs.example.cn/hangzhou-agent-ai-pm",
    });
  });

  it("B5 evaluation report add-to-tracker creates or updates the same server application record", async () => {
    const first = await workflow!.trackApplication({
      company: "Report Bridge",
      role: "AI PM",
      score: 78,
      reportNum: 9001,
      source: "reports_page",
    }, TEST_USER_ID);
    const second = await workflow!.trackApplication({
      company: "report bridge",
      role: "AI PM",
      score: 85,
      reportNum: 9001,
      source: "report_save",
    }, TEST_USER_ID);
    const rows = await dataRepositories!.getDataRepositories().applications.list({ reportNum: 9001 }, TEST_USER_ID);

    expect(first.success).toBe(true);
    expect(second).toMatchObject({ success: true, updated: true });
    expect(second.data?.id).toBe(first.data?.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first.data!.id, score: 85, num: 9001 });
  });
});

describe("application Pipeline evals - boundary", () => {
  it("E1 missing company or role asks for clarification and does not create an empty application", async () => {
    const result = await workflow!.trackApplication({ company: "Acme AI" }, TEST_USER_ID);
    const count = serverDb!.getDb().prepare("SELECT COUNT(*) AS count FROM applications").get() as { count: number };

    expect(result).toMatchObject({ success: false, errorCategory: "need_user_input" });
    expect(count.count).toBe(0);
  });

  it("E2 duplicate company and role updates the existing application instead of creating duplicates", async () => {
    const first = await workflow!.trackApplication({ company: "Acme AI", role: "AI PM", score: 75 }, TEST_USER_ID);
    const second = await workflow!.trackApplication({ company: "acme ai", role: "AI PM", score: 86, jdId: 9 }, TEST_USER_ID);
    const rows = serverDb!.getDb().prepare("SELECT * FROM applications WHERE user_id = ?").all(TEST_USER_ID) as unknown[];

    expect(first.success).toBe(true);
    expect(second).toMatchObject({ success: true, updated: true });
    expect(second.data?.id).toBe(first.data?.id);
    expect(second.data).toMatchObject({ score: 86, jd_id: 9 });
    expect(rows).toHaveLength(1);
  });

  it("E3 ambiguous status update returns candidates and does not mutate a random record", async () => {
    await workflow!.trackApplication({ company: "Acme AI", role: "AI PM" }, TEST_USER_ID);
    await workflow!.trackApplication({ company: "Acme AI", role: "AI Platform PM" }, TEST_USER_ID);
    const result = await workflow!.updateApplicationStatus({ company: "Acme AI", status: "applied" }, TEST_USER_ID);
    const statuses = serverDb!.getDb().prepare("SELECT status FROM applications ORDER BY id").all() as { status: string }[];

    expect(result).toMatchObject({ success: false, ambiguous: true, errorCategory: "need_user_input" });
    expect(result.candidates).toHaveLength(2);
    expect(statuses.map((row) => row.status)).toEqual(["evaluated", "evaluated"]);
  });

  it("E4 historical Evaluated status is normalized in insights", async () => {
    serverDb!.getDb().prepare(`
      INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes)
      VALUES (?, 1, date('now'), 'Legacy Co', 'PM', 80, 'Evaluated', 0, '', '')
    `).run(TEST_USER_ID);
    const data = insights!.getTeamInsights(serverDb!.getDb());

    expect(data.pipelineFunnel.find((stage) => stage.stage === "tracked")?.count).toBe(1);
    expect(data.pipelineFunnel.find((stage) => stage.stage === "evaluated")?.count).toBe(1);
  });

  it("E5 team insights empty state uses zeros rather than mock data", () => {
    const data = insights!.getTeamInsights(serverDb!.getDb());

    expect(data.pipelineFunnel.every((stage) => stage.count === 0)).toBe(true);
    expect(data.marketSignals.directions).toEqual([]);
    expect(data.actionRecommendations[0].priority).toBe("low");
  });
});

describe("application Pipeline evals - regression", () => {
  it("R1 getApplicationContext returns events and next actions for a tracked application", async () => {
    const tracked = await workflow!.trackApplication({ company: "Acme AI", role: "AI PM" }, TEST_USER_ID);
    const context = await workflow!.getApplicationContext({ id: tracked.data!.id }, TEST_USER_ID);

    expect(context.application).toMatchObject({ id: tracked.data!.id, company: "Acme AI" });
    expect(context.events.length).toBeGreaterThan(0);
    expect(context.nextActions.map((action) => action.id)).toContain("apply");
  });

  it("R2 user isolation prevents another user from seeing or mutating applications", async () => {
    const otherUserId = "user-application-pipeline-other";
    serverDb!.getDb().prepare(
      "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
    ).run(otherUserId, "pipeline-other-user", "hash", "Pipeline Other User", "member", "active");
    const tracked = await workflow!.trackApplication({ company: "Private Co", role: "AI PM" }, TEST_USER_ID);
    const context = await workflow!.getApplicationContext({ id: tracked.data!.id }, otherUserId);
    const updated = await workflow!.updateApplicationStatus({ id: tracked.data!.id, status: "applied" }, otherUserId);

    expect(context.application).toBeUndefined();
    expect(context.needsClarification).toBe(true);
    expect(updated).toMatchObject({ success: false, errorCategory: "need_user_input" });
  });

  it("R3 JD evaluation persistence keeps read-back identifiers usable by Pipeline tracking", async () => {
    const repos = dataRepositories!.getDataRepositories();
    await repos.reports.upsert({
      report_num: 12345,
      date: "2026-07-07",
      company: "Persist Eval Co",
      role: "AI Product Manager",
      archetype: "AI产品",
      overall_score: 87,
      legitimacy: "credible",
      blocks_json: "{}",
      keywords_json: "[]",
    }, TEST_USER_ID);
    const report = await repos.reports.get(12345, TEST_USER_ID);
    const jdId = await repos.jds.insert({
      company: "Persist Eval Co",
      role: "AI Product Manager",
      source_type: "agent",
      source_url: "https://jobs.example.cn/persist-eval",
      body: "Persist Eval Co AI Product Manager ".repeat(20),
      keywords_json: "[]",
      report_id: 12345,
    }, TEST_USER_ID);
    const jd = await repos.jds.get(jdId, TEST_USER_ID);
    const tracked = await workflow!.trackApplication({
      company: report!.company,
      role: report!.role,
      score: report!.overall_score,
      reportNum: report!.report_num,
      jdId,
      sourceUrl: jd!.source_url,
      source: "persist_eval_regression",
    }, TEST_USER_ID);

    expect(report).toMatchObject({ report_num: 12345, company: "Persist Eval Co" });
    expect(jd).toMatchObject({ id: jdId, report_id: 12345 });
    expect(tracked).toMatchObject({ success: true, created: true });
    expect(tracked.data).toMatchObject({ num: 12345, jd_id: jdId, source_url: "https://jobs.example.cn/persist-eval" });
  });

  it("R4 job discovery evaluation path can save or reuse JD and add to Pipeline without duplicates", async () => {
    const repos = dataRepositories!.getDataRepositories();
    const jdBody = "Discovery AI Product Manager Hangzhou ".repeat(20);
    const sourceUrl = "https://search.example.cn/jobs/hz-ai-pm";
    const firstJdId = await repos.jds.insert({
      company: "Discovery Co",
      role: "AI Product Manager",
      source_type: "discovery",
      source_url: sourceUrl,
      body: jdBody,
      keywords_json: "[\"AI 产品经理\"]",
      report_id: undefined,
    }, TEST_USER_ID);
    const reusable = await repos.jds.findReusable({ source_url: sourceUrl, body: jdBody }, TEST_USER_ID);
    const firstTrack = await workflow!.trackApplication({
      company: "Discovery Co",
      role: "AI Product Manager",
      jdId: Number(reusable!.id),
      sourceUrl,
      source: "job_discovery",
      metadata: { scanJobId: 77 },
    }, TEST_USER_ID);
    const secondTrack = await workflow!.trackApplication({
      company: "discovery co",
      role: "AI Product Manager",
      jdId: Number(reusable!.id),
      sourceUrl,
      source: "job_discovery",
      metadata: { scanJobId: 77 },
    }, TEST_USER_ID);
    const rows = await repos.applications.list({ jdId: firstJdId }, TEST_USER_ID);

    expect(reusable?.id).toBe(firstJdId);
    expect(firstTrack).toMatchObject({ success: true, created: true });
    expect(secondTrack).toMatchObject({ success: true, updated: true });
    expect(secondTrack.data?.id).toBe(firstTrack.data?.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jd_id: firstJdId, source_url: sourceUrl });
    expect(JSON.parse(rows[0].metadata_json || "{}")).toMatchObject({ scanJobId: 77 });
  });
});
