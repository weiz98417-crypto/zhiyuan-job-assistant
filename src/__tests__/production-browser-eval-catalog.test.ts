import { describe, expect, it } from "vitest";
import {
  AGENT_TASK_TYPES_REQUIRING_BROWSER_SHORT_JOURNEYS,
  CRITICAL_CROSS_TASK_BROWSER_JOURNEYS,
  PRODUCTION_BROWSER_EVAL_DOMAINS,
} from "@/lib/agent/production-browser-eval-catalog";

describe("production browser evaluation catalog", () => {
  it("keeps every feature-system domain represented by at least three browser journeys", () => {
    expect(PRODUCTION_BROWSER_EVAL_DOMAINS).toHaveLength(28);
    expect(PRODUCTION_BROWSER_EVAL_DOMAINS.map((domain) => domain.id)).toEqual([
      "F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10",
      "F11", "F12", "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20",
      "F21", "F22", "F23", "F24", "F25", "F26", "F27", "F28",
    ]);
    for (const domain of PRODUCTION_BROWSER_EVAL_DOMAINS) {
      expect(domain.existingEvalDocument).toMatch(/Evals\.md$/);
      expect(domain.cases.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps distinct routes and unique scenario IDs for executable browser coverage", () => {
    const cases = PRODUCTION_BROWSER_EVAL_DOMAINS.flatMap((domain) => domain.cases);
    expect(new Set(cases.map((scenario) => scenario.id)).size).toBe(cases.length);
    for (const scenario of cases) expect(scenario.route).toMatch(/^\//);
  });

  it("covers every Agent task program and the critical cross-task chains", () => {
    const taskTypes = new Set(
      PRODUCTION_BROWSER_EVAL_DOMAINS.flatMap((domain) => domain.cases.map((scenario) => scenario.taskType).filter(Boolean)),
    );
    expect(taskTypes).toEqual(new Set(AGENT_TASK_TYPES_REQUIRING_BROWSER_SHORT_JOURNEYS));
    expect(CRITICAL_CROSS_TASK_BROWSER_JOURNEYS).toHaveLength(8);
    expect(new Set(CRITICAL_CROSS_TASK_BROWSER_JOURNEYS.map((scenario) => scenario.id)).size)
      .toBe(CRITICAL_CROSS_TASK_BROWSER_JOURNEYS.length);
  });
});
