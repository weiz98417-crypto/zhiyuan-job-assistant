import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getToolsByCategory } from "@/lib/agent/tools";
import { ACTION_TOOL_RISK_AUDIT, getActionToolRisk } from "@/lib/agent/tools/action-tool-risk";
import {
  buildVerifiedActionSuccess,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";

import { scanRuntimeSqliteImports } from "../../scripts/lib/postgres-cutover-check.mjs";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const dir of cleanupPaths.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
