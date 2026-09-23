import { describe, expect, it } from "vitest";
import { createTaskProgramStopGuard } from "@/lib/agent/task-program";

describe("TaskProgramStopGuard (M3)", () => {
  it("returns a guard for deterministic programs and none for conversational ones", () => {
    expect(createTaskProgramStopGuard("resume_edit")).not.toBeNull();
    expect(createTaskProgramStopGuard("jd_evaluation")).not.toBeNull();
    expect(createTaskProgramStopGuard("job_search")).not.toBeNull();
    expect(createTaskProgramStopGuard("general_chat")).toBeNull();
    expect(createTaskProgramStopGuard("interview_coaching")).toBeNull();
  });

  it("reports exactly the unmet success criteria", () => {
    const guard = createTaskProgramStopGuard("jd_evaluation")!;
    const missing = guard.missingCriteria([
      "source content extracted or fetched",
      "A-G evaluation generated",
    ]);
    expect(missing).toEqual([
      "report persisted",
      "saved report read-back verification passes",
    ]);
    expect(guard.missingCriteria([
      "source content extracted or fetched",
      "A-G evaluation generated",
      "report persisted",
      "saved report read-back verification passes",
    ])).toEqual([]);
  });

  it("nudge message names the missing criteria and forbids claiming success", () => {
    const guard = createTaskProgramStopGuard("job_search")!;
    const message = guard.nudgeMessage(["scan read-back or opportunity pool response returned"]);
    expect(message).toContain("program-stop-guard");
    expect(message).toContain("scan read-back or opportunity pool response returned");
    expect(message).toContain("不要向用户宣称任务已完成");
  });

  it("incomplete response never claims success", () => {
    const guard = createTaskProgramStopGuard("resume_edit")!;
    const response = guard.incompleteResponse(["user approved draft"]);
    expect(response).toContain("还没有完成");
    expect(response).toContain("user approved draft");
  });
});
