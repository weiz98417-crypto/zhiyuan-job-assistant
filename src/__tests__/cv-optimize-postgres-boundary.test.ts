import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("CV optimization database boundary", () => {
  it("keeps judge-engine pure so PostgreSQL runtime does not touch SQLite getDb", () => {
    const judgeEngine = source("src/lib/judge-engine.ts");
    const optimizeService = source("src/lib/server/resume-optimization-service.ts");

    expect(judgeEngine).not.toContain("@/lib/server-db");
    expect(judgeEngine).not.toContain("getReferenceResume(");
    expect(judgeEngine).not.toContain("getRecentPreferences(");

    expect(optimizeService).toContain("getDataRepositories");
    expect(optimizeService).toContain("referenceResumes.get");
    expect(optimizeService).toContain("preferences.listRecent");
    expect(optimizeService).toContain("referenceResumes: explicitReferences");
    expect(optimizeService).toContain("preferences");
  });

  it("exposes recent optimization preferences through both repository drivers", () => {
    const repositories = source("src/lib/data-repositories.ts");

    expect(repositories).toContain("listRecent(userId: string, limit?: number)");
    expect(repositories).toContain("WHERE user_id = ? OR user_id IS NULL");
    expect(repositories).toContain("WHERE user_id = $1");
  });
});
