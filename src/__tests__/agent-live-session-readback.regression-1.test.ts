import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("durable Agent live session read-back regression", () => {
  it("retries session read-back after terminal status events", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");
    const terminalHandler = source.slice(
      source.indexOf('if (!NON_TERMINAL_DURABLE_RUN_STATUSES.has(status))'),
      source.indexOf('continue;', source.indexOf('if (!NON_TERMINAL_DURABLE_RUN_STATUSES.has(status))')),
    );

    expect(terminalHandler).toContain("const refreshPersistedMessages = async () => {");
    expect(terminalHandler).toContain("attempt < 8");
    expect(terminalHandler).toContain("currentSessionIdRef.current !== sessionId");
    expect(terminalHandler).toContain("setTimeout(resolve, 250)");
    expect(terminalHandler).not.toContain("setTimeout(() =>");
  });
});
