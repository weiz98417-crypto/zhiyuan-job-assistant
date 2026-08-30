import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("live resume-edit user path", () => {
  it("creates the durable run before optional orchestration work", () => {
    const page = source("src/app/agent/page.tsx");
    const sendMessage = page.slice(page.indexOf("const sendMessage = useCallback"));

    expect(sendMessage.indexOf("createDurableAgentRunClient({")).toBeGreaterThan(-1);
    expect(sendMessage.indexOf("await orchestrate(routedContent")).toBeGreaterThan(-1);
    expect(sendMessage.indexOf("createDurableAgentRunClient({")).toBeLessThan(
      sendMessage.indexOf("await orchestrate(routedContent"),
    );
  });

  it("uses thinking-orbs and keeps elapsed time in the activity track", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const activity = source("src/components/agent/AgentActivityTrack.tsx");
    const page = source("src/app/agent/page.tsx");

    expect(packageJson.dependencies?.["thinking-orbs"]).toBeTruthy();
    expect(activity).toContain('from "thinking-orbs"');
    expect(activity).toContain("startTime?: number");
    expect(activity).toContain("data-testid=\"agent-run-elapsed\"");
    expect(page).toContain("startTime={startTime}");
  });
});
