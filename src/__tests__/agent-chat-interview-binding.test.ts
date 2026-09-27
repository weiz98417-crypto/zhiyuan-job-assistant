import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("AgentChat interview binding", () => {
  it("renders the active interview binding from persisted session state", () => {
    const chat = source("src/components/agent/AgentChat.tsx");
    const cards = source("src/components/agent/AgentDomainCards.tsx");
    const page = source("src/app/agent/page.tsx");

    expect(chat).toContain("interviewState?: InterviewSessionState");
    expect(cards).toContain("function InterviewBindingBar");
    expect(cards).toContain("当前面试绑定");
    expect(cards).toContain("plan.jdSnapshot?.company");
    expect(cards).toContain("plan.resumeSnapshot?.title");
    expect(page).toContain("currentSession?.interviewState");
    expect(page).toContain("interviewState={currentSession?.interviewState}");
  });
});
