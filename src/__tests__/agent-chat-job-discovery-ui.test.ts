import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("Agent Chat job discovery cards", () => {
  it("renders structured job discovery payloads as dedicated cards", () => {
    const sourceText = source("src/components/agent/AgentChat.tsx");

    expect(sourceText).toContain("function JobDiscoveryConfirmationCard");
    expect(sourceText).toContain("function JobDiscoveryRunCard");
    expect(sourceText).toContain("function JobDiscoveryCard");
    expect(sourceText).toContain("function JobDiscoveryBatchCard");
    expect(sourceText).toContain("job_discovery_confirmation");
    expect(sourceText).toContain("job_discovery_run");
    expect(sourceText).toContain("job_discovery_batch");
    expect(sourceText).toContain("job_discovery_error");
    expect(sourceText).toContain("jobs.slice(0, 5)");
    expect(sourceText).toContain("payload.profileDerived");
    expect(sourceText).toContain("saveDiscoveryJobJD");
    expect(sourceText).toContain("getAgentEvaluationUrl");
    expect(sourceText).toContain("原链接");
    expect(sourceText).toContain("打开 JD");
  });
});
