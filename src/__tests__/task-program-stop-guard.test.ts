import { describe, expect, it } from "vitest";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
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
    expect(message).toContain("扫描结果已读回");
    expect(message).toContain("不要向用户宣称任务已完成");
  });

  it("incomplete response never claims success", () => {
    const guard = createTaskProgramStopGuard("resume_edit")!;
    const response = guard.incompleteResponse(["user approved draft"]);
    expect(response).toContain("还没有完成");
    expect(response).toContain("用户确认了优化方案");
    expect(response).not.toContain("user approved draft");
  });

  it("uses the active draft-only contract criteria instead of the default apply criteria", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: "只生成简历优化草稿，不应用",
      requiresUserApproval: false,
      successCriteria: ["draft generated", "draft read-back verification passes"],
      validators: ["draft_read_back"],
      routing: { resumeEditMode: "draft_only" } as never,
    });
    const guard = createTaskProgramStopGuard(contract);

    expect(guard).not.toBeNull();
    expect(guard?.missingCriteria(["draft generated"])).toEqual(["draft read-back verification passes"]);
    expect(guard?.missingCriteria(["draft generated", "draft read-back verification passes"])).toEqual([]);
    expect(guard?.incompleteResponse(["draft read-back verification passes"])).not.toContain("user approved draft");
  });
});
