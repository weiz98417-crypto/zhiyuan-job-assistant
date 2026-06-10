import { describe, expect, it } from "vitest";
import { decideRepairPolicy } from "@/lib/agent/repair-policy";

describe("agent repair policy", () => {
  it("retries transient failures only within the configured limit", () => {
    expect(decideRepairPolicy({ category: "transient", retryCount: 0, maxRetries: 2 })).toMatchObject({
      action: "retry",
      shouldRetry: true,
    });

    expect(decideRepairPolicy({ category: "transient", retryCount: 2, maxRetries: 2 })).toMatchObject({
      action: "safe_fail",
      shouldRetry: false,
    });
  });

  it("blocks validation failures before writes", () => {
    expect(decideRepairPolicy({
      category: "validation_failed",
      protectedTarget: "简历项目经验",
      detail: "内容是占位符",
    })).toMatchObject({
      action: "safe_fail",
      shouldRetry: false,
      shouldRollback: false,
      requiresUserInput: false,
    });
  });

  it("requires rollback or failure when read-back verification mismatches", () => {
    expect(decideRepairPolicy({
      category: "read_back_mismatch",
      protectedTarget: "CV",
    })).toMatchObject({
      action: "rollback",
      shouldRollback: true,
      shouldRetry: false,
    });
  });

  it("asks one clarification question for unclear intent or version conflicts", () => {
    expect(decideRepairPolicy({ category: "unclear_intent" })).toMatchObject({
      action: "ask_clarification",
      requiresUserInput: true,
    });
    expect(decideRepairPolicy({ category: "base_version_conflict", protectedTarget: "简历" })).toMatchObject({
      action: "ask_clarification",
      requiresUserInput: true,
    });
  });

  it("requires explicit approval for destructive risk and denies policy violations", () => {
    expect(decideRepairPolicy({ category: "destructive_risk", protectedTarget: "报告库" })).toMatchObject({
      action: "require_approval",
      requiresUserInput: true,
    });
    expect(decideRepairPolicy({ category: "policy_denied", protectedTarget: "长期记忆" })).toMatchObject({
      action: "deny",
      requiresUserInput: false,
    });
  });
});
