import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("qwen-long removal regression", () => {
  it("keeps DashScope/qwen-long out of CV file parsing routes", () => {
    const routeFiles = [
      "src/app/api/cv/import/route.ts",
      "src/app/api/cv/import-reference/route.ts",
    ];

    for (const file of routeFiles) {
      const source = readProjectFile(file);
      expect(source, file).not.toMatch(/qwen-long/);
      expect(source, file).not.toMatch(/DASHSCOPE_BASE/);
      expect(source, file).not.toMatch(/file-extract/);
      expect(source, file).not.toMatch(/parseViaQwenLong|extractViaQwenLong/);
    }
  });

  it("keeps qwen-long out of agent reasoning fallback chains", () => {
    const agentFiles = [
      "src/lib/agent/loop/server-runner.ts",
      "src/lib/agent/classify-intent-llm.ts",
      "src/app/api/agent/think/route.ts",
    ];

    for (const file of agentFiles) {
      const source = readProjectFile(file);
      expect(source, file).not.toMatch(/qwen-long/);
      expect(source, file).not.toMatch(/DASHSCOPE_API_KEY/);
    }
  });
});
