import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getToolsByCategory } from "@/lib/agent/tools";
import { ACTION_TOOL_RISK_AUDIT, getActionToolRisk } from "@/lib/agent/tools/action-tool-risk";
import {
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

describe("agent run ledger and task contracts", () => {
  it("defines durable Postgres tables for agent runs and steps", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "postgres-schema.sql"), "utf-8");

    expect(schema).toContain("CREATE TABLE IF NOT EXISTS agent_runs");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS agent_run_steps");
    expect(schema).toContain("idx_agent_runs_user_status");
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

  it("allows final success only when verified write evidence satisfies the resume contract", () => {
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
      data: { saved: true },
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

  afterEach(() => {
    if (originalDriver === undefined) delete process.env.DB_DRIVER;
    else process.env.DB_DRIVER = originalDriver;
    if (originalLegacy === undefined) delete process.env.ALLOW_SQLITE_LEGACY;
    else process.env.ALLOW_SQLITE_LEGACY = originalLegacy;
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
    process.env.DB_DRIVER = "postgres";
    process.env.ALLOW_SQLITE_LEGACY = "readonly";
    vi.resetModules();

    const archive = await import("@/lib/server-db");
    const db = archive.getDb();
    expect(() => db.prepare("SELECT 1").get()).not.toThrow();
    expect(() => db.prepare("CREATE TABLE IF NOT EXISTS readonly_probe (id INTEGER)").run()).toThrow();
    db.close();
  });
});
