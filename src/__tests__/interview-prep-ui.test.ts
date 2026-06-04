import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("Interview Prep UI surfaces", () => {
  it("keeps preparation, history, and recap review as separate surfaces", () => {
    const page = source("src/app/interview/page.tsx");

    expect(page).toContain("准备下一场模拟");
    expect(page).toContain("历史模拟面试");
    expect(page).toContain("复盘与转录回看");
    expect(page).toContain("<InterviewLaunchPanel");
    expect(page).toContain("<AgentInterviewHistory");
    expect(page).toContain("<InterviewRecapReview");
  });

  it("shows Agent interview history metadata and recap entries", () => {
    const history = source("src/app/interview/AgentInterviewHistory.tsx");
    const recap = source("src/app/interview/InterviewRecapReview.tsx");

    expect(history).toContain("statusLabel");
    expect(history).toContain("averageScore");
    expect(history).toContain("有复盘");
    expect(history).toContain("plan?.jdSnapshot?.company");
    expect(history).toContain("plan?.resumeSnapshot?.title");
    expect(recap).toContain("recap.overallVerdict");
    expect(recap).toContain("state?.transcript?.length");
  });

  it("renders recap review from structured recap fields", () => {
    const recap = source("src/app/interview/InterviewRecapReview.tsx");

    expect(recap).toContain("StructuredRecap");
    expect(recap).toContain("recap.followUpPerformance");
    expect(recap).toContain("recap.evidenceFromAnswers");
    expect(recap).toContain("recap.questionFeedback");
    expect(recap).toContain("recap.nextPracticePlan");
    expect(recap).not.toContain("rawText");
  });

  it("links recap review to the frozen plan snapshot and source transcript turns", () => {
    const recap = source("src/app/interview/InterviewRecapReview.tsx");

    expect(recap).toContain("PlanSnapshotTrace");
    expect(recap).toContain("SourceTranscriptTrace");
    expect(recap).toContain("state?.planSnapshot");
    expect(recap).toContain("recap.sourceTurnIds");
    expect(recap).toContain("transcript.filter((turn) => sourceIds.has(turn.id))");
  });
});
