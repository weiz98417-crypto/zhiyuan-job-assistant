import { describe, expect, it } from "vitest";
import { parseApplicationsMDWithDiagnostics } from "@/lib/parsers";

describe("applications import diagnostics", () => {
  it("counts malformed rows and unknown statuses instead of silently dropping them", () => {
    const parsed = parseApplicationsMDWithDiagnostics([
      "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
      "|---|---|---|---|---|---|---|---|---|",
      "| 1 | 2026-10-13 | A | PM | 4/5 | 已评估 | ✅ | [r](reports/1.md) | ok |",
      "| bad | 2026-10-13 | B | PM | 4/5 | unknown | ✅ | | bad |",
      "| 3 | 2026-10-13 | | | | | | | malformed |",
    ].join("\n"));
    expect(parsed.headerFound).toBe(true);
    expect(parsed.applications).toHaveLength(1);
    expect(parsed.invalidRows).toBe(2);
  });
});
