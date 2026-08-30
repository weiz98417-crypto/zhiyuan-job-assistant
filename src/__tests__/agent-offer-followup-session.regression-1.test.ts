import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOfferAgentHandoffUrl } from "@/lib/agent/offer-handoff";

describe("Offer result-card follow-up session continuity regression", () => {
  it("keeps HR follow-up in the current Agent Conversation", () => {
    const url = buildOfferAgentHandoffUrl(3, "ask_hr", 2);

    expect(url).toBe("/agent?sessionId=2&offerReportId=3&intent=ask_hr");
    expect(url).not.toContain("newSession=1");
  });

  it("passes the current Conversation id from the Agent page into result cards", () => {
    const agentChat = readFileSync(path.join(process.cwd(), "src/components/agent/AgentChat.tsx"), "utf-8");
    const agentPage = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf-8");

    expect(agentChat).toContain("currentSessionId: number | null");
    expect(agentChat).toContain('buildOfferAgentHandoffUrl(reportId, "ask_hr", currentSessionId)');
    expect(agentPage).toContain("currentSessionId={currentSessionId}");
  });
});
