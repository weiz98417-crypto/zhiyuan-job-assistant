import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression: ISSUE-ONLINE-004 — terminal read-back refreshed messages but left interviewState stale
// Found by /qa on 2026-08-28
// Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-28.md
describe("durable interview state live read-back regression", () => {
  it("replaces the active session after reading the Worker result from the server", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");
    const start = source.indexOf("const refreshPersistedMessages = async () => {");
    const end = source.indexOf("void refreshPersistedMessages();", start);
    const readBack = source.slice(start, end);

    expect(readBack).toContain("setMessages(session.messages);");
    expect(readBack).toContain("setSessions((current) => current.map((item) => item.id === sessionId ? session : item));");
  });
});
