import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { getToolsByCategory } from "@/lib/agent/tools";
import { ACTION_TOOL_RISK_AUDIT, getActionToolRisk } from "@/lib/agent/tools/action-tool-risk";
import {
  enforceReadBackSuccessGate,
  getReadBackRequirementStatus,
  hasReadBackVerificationEvidence,
  requiresReadBackVerification,
} from "@/lib/agent/tools/readback-verification";
import { saveReferenceResume } from "@/lib/agent/tools/action/save-reference-resume";
import { updateReportMetadata } from "@/lib/agent/tools/action/update-report-metadata";
import {
  buildVerifiedActionSuccess,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";
import {
  canClaimTaskSuccess,
  createAgentTaskContract,
  createResumeBaseSnapshot,
  evaluateTaskContractCompletion,
  inferCompletedCriteriaFromToolResult,
  unmetSuccessCriteria,
} from "@/lib/agent/task-contract";

import { scanRuntimeSqliteImports } from "../../scripts/lib/postgres-cutover-check.mjs";
import { formatVerificationReport, verifyMigration } from "../../scripts/lib/sqlite-postgres-migration.mjs";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const dir of cleanupPaths.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("agent action risk audit", () => {
  it("classifies every registered action tool", () => {
    const actionNames = getToolsByCategory("action").map((tool) => tool.name).sort();
    const auditedNames = ACTION_TOOL_RISK_AUDIT.map((record) => record.toolName).sort();

    expect(auditedNames).toEqual(actionNames);
    expect(getActionToolRisk("save_resume_section")).toMatchObject({
      risk: "high-risk-write",
      requiresVerifiedWrite: true,
      targets: expect.arrayContaining(["cv"]),
    });
    expect(getActionToolRisk("apply_resume_edit_proposal")).toMatchObject({
      risk: "high-risk-write",
      requiresVerifiedWrite: true,
      targets: expect.arrayContaining(["cv"]),
    });
    expect(getActionToolRisk("discard_resume_edit_proposal")).toMatchObject({
      risk: "high-risk-write",
      requiresVerifiedWrite: true,
      targets: expect.arrayContaining(["cv"]),
    });
    expect(getActionToolRisk("rollback_resume_edit_proposal")).toMatchObject({
      risk: "high-risk-write",
      requiresVerifiedWrite: true,
      targets: expect.arrayContaining(["cv"]),
    });
  });
});

describe("verified action validators", () => {
  it("rejects placeholder document content and markdown control output", () => {
    const result = validateDocumentFieldContent(
      "| 修改前 | 修改后 | 原因 |\n| --- | --- | --- |\n| A | B | C |",
      { minCompactLength: 10, targetLabel: "skills" },
    );

    expect(result.valid).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "markdown.diff_table", ok: false }),
      ]),
    );

    expect(validateDocumentFieldContent("```markdown\n简历内容\n```").valid).toBe(false);
    expect(validateDocumentFieldContent("好的，简历被截断了，让我补读完整。").valid).toBe(false);
  });

  it("does not allow read-back mismatch to report success", () => {
    const result = buildVerifiedActionSuccess({
      action: "save_resume_section",
      targetType: "cv",
      targetField: "projects",
      data: { saved: true },
      expectedContent: "完整项目经验正文",
      readBackContent: "另一段内容",
      checks: validateDocumentFieldContent("完整项目经验正文", { minCompactLength: 4 }).checks,
    });

    expect(result.success).toBe(false);
    expect(result.readBack).toMatchObject({
      ok: false,
      code: "read_back.mismatch",
    });
  });
});

describe("postgres cutover scan", () => {
  it("reports blocking production SQLite imports and allowlisted bridge files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-cutover-scan-"));
    cleanupPaths.push(dir);
    fs.mkdirSync(path.join(dir, "src", "app", "api", "demo"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src", "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src", "app", "api", "demo", "route.ts"),
      'import { getDb } from "@/lib/server-db";\nexport function GET() { return getDb().prepare("SELECT 1").get(); }\n',
      "utf-8",
    );
    fs.mkdirSync(path.join(dir, "src", "app", "api", "types-only"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src", "app", "api", "types-only", "route.ts"),
      'import type { ReportRow } from "@/lib/server-db";\nexport const row: ReportRow | null = null;\n',
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "src", "lib", "data-repositories.ts"),
      'import { getDb } from "@/lib/server-db";\nexport function bridge() { return getDb(); }\n',
      "utf-8",
    );

    const hits = scanRuntimeSqliteImports({
      rootDir: dir,
      scanRoots: [path.join(dir, "src", "app"), path.join(dir, "src", "lib")],
    });

    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "src/app/api/demo/route.ts", allowed: false }),
        expect.objectContaining({ file: "src/lib/data-repositories.ts", allowed: true }),
      ]),
    );
    expect(hits.some((hit) => hit.file === "src/app/api/types-only/route.ts")).toBe(false);
  });
});

describe("postgres cutover archive verification", () => {
  it("keeps migration verification strict but allows target drift in cutover mode", async () => {
    const sqliteDb = new Database(":memory:");
    sqliteDb.exec(`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY,
        user_id TEXT,
        data_json TEXT,
        goals_json TEXT,
        history_json TEXT
      );
      INSERT INTO profiles (id, user_id, data_json, goals_json, history_json)
      VALUES (1, 'user-1', '{"headline":"old"}', '{}', '[]');
    `);

    const pgClient = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("information_schema.columns")) {
          return {
            rows: ["id", "user_id", "data_json", "goals_json", "history_json"].map((column_name) => ({ column_name })),
            rowCount: 5,
          };
        }
        if (sql.includes("SELECT user_id, COUNT(*) AS count FROM \"profiles\"")) {
          return { rows: [{ user_id: "user-1", count: 2 }], rowCount: 1 };
        }
        if (sql.includes("SELECT COUNT(*) AS count FROM \"profiles\"")) {
          return { rows: [{ count: 2 }], rowCount: 1 };
        }
        if (sql.includes("SELECT 1 FROM \"profiles\" WHERE \"id\" = $1")) {
          return { rows: [{ "?column?": 1 }], rowCount: 1 };
        }
        if (sql.includes("SELECT \"data_json\", \"goals_json\", \"history_json\" FROM \"profiles\"")) {
          return {
            rows: [{
              data_json: { headline: "new" },
              goals_json: {},
              history_json: [],
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    try {
      const strict = await verifyMigration({ sqliteDb, pgClient, sampleSize: 1 });
      expect(strict.ok).toBe(false);
      expect(strict.errors).toEqual(expect.arrayContaining([
        "profiles.data_json sample 1: JSON mismatch",
        "profiles: per-user counts mismatch",
      ]));

      const cutover = await verifyMigration({ sqliteDb, pgClient, sampleSize: 1, mode: "cutover" });
      expect(cutover.ok).toBe(true);
      expect(cutover.errors).toEqual([]);
      expect(cutover.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining("accepted as post-cutover target drift"),
      ]));

      const formatted = formatVerificationReport(cutover);
      expect(formatted).toContain("Mode: cutover");
      expect(formatted).toContain("profiles.data_json 1: drift");
      expect(formatted).toContain("[target>=source]");
    } finally {
      sqliteDb.close();
    }
  });
});

describe("agent run ledger and task contracts", () => {
  it("defines durable Postgres tables for agent runs and steps", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "postgres-schema.sql"), "utf-8");

    expect(schema).toContain("CREATE TABLE IF NOT EXISTS agent_runs");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS agent_run_steps");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS agent_run_reviews");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS agent_eval_candidates");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS resume_edit_proposals");
    expect(schema).toContain("idx_agent_runs_user_status");
    expect(schema).toContain("agent_run_reviews_verdict_check");
    expect(schema).toContain("agent_eval_candidates_status_check");
    expect(schema).toContain("idx_agent_eval_candidates_dedupe");
  });

  it("requires task criteria before an agent can claim durable success", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: "cv.projects",
      baseHash: "hash:old",
    });

    expect(contract.requiresUserApproval).toBe(true);
    expect(contract.successCriteria).toContain("target section read-back hash matches applied content");
    expect(canClaimTaskSuccess(contract, ["draft generated"])).toBe(false);
    expect(unmetSuccessCriteria(contract, ["draft generated"])).toContain("user approved draft");
    expect(canClaimTaskSuccess(contract, contract.successCriteria)).toBe(true);
  });

  it("treats current resume lookup as read-only instead of a resume write", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_query",
      target: "我的简历",
    });
    const criteria = [
      ...inferCompletedCriteriaFromToolResult(contract, {
        toolName: "read_file",
        toolSuccess: true,
        data: { content: "个人概述\n5年C端产品经验" },
      }),
      "answer generated",
    ];
    const gate = evaluateTaskContractCompletion(contract, criteria);

    expect(contract.requiresUserApproval).toBe(false);
    expect(contract.successCriteria).toEqual(["resume context read", "answer generated"]);
    expect(gate.canClaimSuccess).toBe(true);
    expect(gate.safeMessage).toBeUndefined();
    expect(gate.unmetCriteria).not.toContain("user approved draft");
    expect(gate.unmetCriteria).not.toContain("target section read-back hash matches applied content");
  });

  it("prevents final success when a JD report was generated but not read back", () => {
    const contract = createAgentTaskContract({
      taskType: "jd_evaluation",
      target: "jd:agent",
    });
    const blocks = Object.fromEntries(
      ["a", "b", "c", "d", "e", "f", "g"].map((key) => [key, { content: `${key} block`, score: 3 }]),
    );
    const criteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "evaluate_jd_full",
      toolSuccess: true,
      data: {
        jdText: "This is a sufficiently long JD text for extraction and evaluation.",
        blocks,
        reportNum: 12,
      },
      readBackVerified: false,
    });
    const gate = evaluateTaskContractCompletion(contract, criteria);

    expect(gate.canClaimSuccess).toBe(false);
    expect(gate.completedCriteria).toEqual(
      expect.arrayContaining(["source content extracted or fetched", "A-G evaluation generated", "report persisted"]),
    );
    expect(gate.unmetCriteria).toContain("saved report read-back verification passes");
    expect(gate.safeMessage).not.toMatch(/已保存|成功/);
  });

  it("does not treat a legacy save proposal as final resume success", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: "cv.skills",
      baseHash: "hash:old",
    });
    const content = "AI product design\nPrompt Engineering\nRAG knowledge base";
    const verifiedAction = buildVerifiedActionSuccess({
      action: "save_resume_section",
      targetType: "cv",
      targetField: "skills",
      data: { saved: false, proposalCreated: true },
      expectedContent: content,
      readBackContent: content,
      checks: validateDocumentFieldContent(content).checks,
    });
    const criteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "save_resume_section",
      toolSuccess: true,
      verifiedAction,
    });
    const gate = evaluateTaskContractCompletion(contract, criteria);

    expect(gate.canClaimSuccess).toBe(false);
    expect(gate.completedCriteria).toEqual(expect.arrayContaining(["draft generated", "content validator passes", "version snapshot created"]));
    expect(gate.unmetCriteria).toContain("user approved draft");
    expect(gate.unmetCriteria).toContain("target section read-back hash matches applied content");
  });

  it("allows final resume success through an applied proposal with read-back evidence", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: "cv.skills",
      baseHash: "hash:old",
    });
    const content = "AI product design\nPrompt Engineering\nRAG knowledge base";
    const verifiedAction = buildVerifiedActionSuccess({
      action: "apply_resume_edit_proposal",
      targetType: "cv",
      targetField: "skills",
      data: { proposalId: "rep-1", readBackVerified: true },
      expectedContent: content,
      readBackContent: content,
      checks: validateDocumentFieldContent(content).checks,
    });
    const criteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "apply_resume_edit_proposal",
      toolSuccess: true,
      verifiedAction,
    });
    const gate = evaluateTaskContractCompletion(contract, criteria);

    expect(gate.canClaimSuccess).toBe(true);
    expect(gate.unmetCriteria).toEqual([]);
  });

  it("detects missing read-back evidence for high-risk action tools", () => {
    expect(requiresReadBackVerification("save_resume_section")).toBe(true);
    expect(requiresReadBackVerification("generate_interview_questions")).toBe(false);

    expect(getReadBackRequirementStatus("save_resume_section", {
      success: true,
      data: { saved: true },
    })).toMatchObject({
      required: true,
      satisfied: false,
      deferred: false,
    });

    expect(hasReadBackVerificationEvidence({
      data: { readBackVerified: true },
    })).toBe(true);
  });

  it("forces high-risk write tools to fail when success lacks read-back evidence", () => {
    const gated = enforceReadBackSuccessGate("save_resume_section", {
      success: true,
      data: { sectionId: "skills", saved: true },
      errorCategory: "ok",
    });

    expect(gated.success).toBe(false);
    expect(gated.errorCategory).toBe("permanent");
    expect(gated.uiPayload).toMatchObject({
      readBackVerified: false,
      gatedByReadBack: true,
    });
    expect(gated.verifiedAction?.success).toBe(false);
    expect(gated.verifiedAction?.verifier.code).toBe("read_back.required_missing");
  });

  it("allows high-risk write success when verified read-back evidence is present", () => {
    const content = "SQL / RAG / Prompt Engineering";
    const verifiedAction = buildVerifiedActionSuccess({
      action: "save_resume_section",
      targetType: "cv",
      targetField: "skills",
      data: { saved: true },
      expectedContent: content,
      readBackContent: content,
      checks: validateDocumentFieldContent(content).checks,
    });
    const passed = enforceReadBackSuccessGate("save_resume_section", {
      success: true,
      data: { sectionId: "skills", saved: true },
      errorCategory: "ok",
      verifiedAction,
    });

    expect(passed.success).toBe(true);
    expect(passed.verifiedAction?.readBack?.ok).toBe(true);
  });

  it("satisfies the reference resume save contract only with read-back evidence", () => {
    const contract = createAgentTaskContract({
      taskType: "reference_resume_save",
      target: "reference_resume:AI product manager",
    });
    const data = {
      id: 7,
      name: "AI PM reference resume",
      roleCategory: "AI产品经理",
      sections: [{ id: "projects", content: "project" }],
      readBackVerified: true,
    };
    const criteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "save_reference_resume",
      toolSuccess: true,
      data,
      uiPayload: data,
      readBackVerified: true,
    });
    const gate = evaluateTaskContractCompletion(contract, criteria);

    expect(gate.canClaimSuccess).toBe(true);
    expect(gate.unmetCriteria).toEqual([]);
  });

  it("reads back a saved reference resume before reporting tool success", async () => {
    const saved = {
      id: 7,
      name: "AI PM reference resume",
      roleCategory: "AI产品经理",
      visibility: "private",
      sections: [{ id: "projects", content: "完整项目经历" }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: saved }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: saved }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveReferenceResume.handler({
      resume_text: "个人概述\nAI产品经理\n项目经历\n完整项目经历",
      role_category: "AI产品经理",
      visibility: "private",
    });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({ ok: true });
    expect(result.uiPayload).toMatchObject({ readBackVerified: true });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/cv/references/7", { cache: "no-store" });
  });

  it("reads back updated report metadata before reporting tool success", async () => {
    const report = {
      report_num: 5,
      company: "NewCo",
      role: "AI PM",
      archetype: "AI产品经理",
      legitimacy: "ok",
      keywords_json: JSON.stringify(["AI", "PM"]),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: report }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: report }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateReportMetadata.handler({
      reportNum: 5,
      company: "NewCo",
      keywords: ["AI", "PM"],
    });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({ ok: true });
    expect(result.uiPayload).toMatchObject({ readBackVerified: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/data/reports/5",
      { cache: "no-store" },
    );
  });

  it("captures resume base version and hash for durable edit contracts", () => {
    const snapshot = createResumeBaseSnapshot({
      activeVersion: "v2",
      versions: {
        v1: { sections: [{ id: "skills", content: "old" }] },
        v2: { sections: [{ id: "skills", content: "SQL / RAG" }] },
      },
    });
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: "cv.skills",
      ...snapshot,
    });

    expect(contract.baseVersion).toBe("v2");
    expect(contract.baseHash).toMatch(/^fnv1a32:/);
  });
});

describe("SQLite archive policy", () => {
  const originalDriver = process.env.DB_DRIVER;
  const originalLegacy = process.env.ALLOW_SQLITE_LEGACY;
  const originalDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (originalDriver === undefined) delete process.env.DB_DRIVER;
    else process.env.DB_DRIVER = originalDriver;
    if (originalLegacy === undefined) delete process.env.ALLOW_SQLITE_LEGACY;
    else process.env.ALLOW_SQLITE_LEGACY = originalLegacy;
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    vi.resetModules();
  });

  it("blocks SQLite runtime access under Postgres unless archive mode is readonly", async () => {
    process.env.DB_DRIVER = "postgres";
    delete process.env.ALLOW_SQLITE_LEGACY;
    vi.resetModules();

    const blocked = await import("@/lib/server-db");
    expect(() => blocked.getDb()).toThrow(/DB_DRIVER=postgres/);
  });

  it("opens SQLite as a read-only archive when explicitly requested", async () => {
    const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-sqlite-archive-"));
    cleanupPaths.push(archiveDir);
    const seed = new Database(path.join(archiveDir, "zhiyuan.db"));
    seed.exec("CREATE TABLE archive_probe (id INTEGER)");
    seed.close();

    process.env.DB_DRIVER = "postgres";
    process.env.ALLOW_SQLITE_LEGACY = "readonly";
    process.env.DATA_DIR = archiveDir;
    vi.resetModules();

    const archive = await import("@/lib/server-db");
    const db = archive.getDb();
    expect(() => db.prepare("SELECT 1").get()).not.toThrow();
    expect(() => db.prepare("CREATE TABLE IF NOT EXISTS readonly_probe (id INTEGER)").run()).toThrow();
    db.close();
  });
});
