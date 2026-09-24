import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");

describe("Agent session activity isolation", () => {
  it("only exposes a run notice in its owning conversation", () => {
    expect(page).toContain(
      "storedRunNotice?.conversationId === currentSessionId ? storedRunNotice : null",
    );
    expect(page).toContain("if (!isCurrentObserver()) return;");
    expect(page).toContain("if (!isCurrentConversation()) return;");
    expect(page).toContain("if (!isCurrentTurn()) return;");
  });

  it("reloads selected conversations without overwriting worker messages", () => {
    expect(page).toContain("getSession(id, { preferServer: true })");
    expect(page).not.toContain("updateSession(currentSessionId, { messages });");
  });

  it("admits explicit image evaluations before legacy OCR", () => {
    const admitRun = page.indexOf("earlyCreatedRun = await createDurableAgentRunClient(");
    const imageIntake = page.indexOf('fetch("/api/agent/image-intake"');

    expect(admitRun).toBeGreaterThan(0);
    expect(imageIntake).toBeGreaterThan(admitRun);
    expect(page).toContain("const created = earlyCreatedRun || await createDurableAgentRunClient(");
  });
});
