import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : collectSourceFiles(entryPath);
    }
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("DeepSeek key configuration", () => {
  it("keeps server-side DeepSeek calls on the private shared key", () => {
    // Regression: ISSUE-KEY-001 — recommendations used a stale public DeepSeek key
    // Found by /qa on 2026-08-27
    // Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-27.md
    const source = collectSourceFiles(path.join(ROOT, "src"))
      .map((filePath) => fs.readFileSync(filePath, "utf8"))
      .join("\n");

    expect(source).not.toContain("NEXT_PUBLIC_DEEPSEEK_API_KEY");
  });
});
