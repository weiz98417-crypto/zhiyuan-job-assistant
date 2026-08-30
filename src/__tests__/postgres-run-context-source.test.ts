import { describe, expect, it, vi } from "vitest";
import { PostgresRunContextSource } from "@/lib/agent/runtime/postgres-run-context-source";

describe("Postgres Run Context source", () => {
  it("loads verified attempt summaries, gates, evidence summaries, and fact references", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM agent_tool_attempts")) {
        if (sql.includes("status <> 'succeeded'")) {
          return { rows: [{
            tool_name: "apply_resume_edit_proposal",
            status: "reconciling",
            effect_state: "unknown",
            error_json: {
              observation: {
                userSafeSummary: "工具执行结果尚未确认，需要先对账",
              },
              secret: "must not enter context",
            },
          }] };
        }
        return { rows: [{
          id: "attempt-1",
          tool_name: "read_file",
          args_hash: "args-hash",
          effect_state: "verified",
          result_json: {
            success: true,
            llmSummary: "已读取简历版本 v3",
            data: { fullResume: "候选人姓名：张三" },
          },
          updated_at: new Date("2026-08-24T10:00:00.000Z"),
        }] };
      }
      if (sql.includes("FROM agent_run_gates")) {
        return { rows: [{
          id: "gate-1",
          tool_name: "save_resume_section",
          status: "approved",
          scope_hash: "scope-1",
          request_json: { toolName: "save_resume_section", args: { section: "summary" } },
          resolved_at: new Date("2026-08-24T10:01:00.000Z"),
        }] };
      }
      if (sql.includes("FROM agent_run_events")) {
        return { rows: [
          { event_type: "run.model_output_complete", payload_json: { summary: "已完成上一轮回答" } },
          { event_type: "run.model_output_interrupted", payload_json: { charCount: 23 } },
        ] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const source = new PostgresRunContextSource(async (callback) => callback({ query } as never));

    const material = await source.load({ userId: "user-1" }, "run-1");

    expect(material).toEqual({
      completedToolFacts: [{ toolName: "read_file", summary: "已读取简历版本 v3" }],
      recoveryObservations: [{
        toolName: "apply_resume_edit_proposal",
        summary: "工具尝试状态为 reconciling/unknown：工具执行结果尚未确认，需要先对账",
      }],
      evidence: [
        { type: "model.output_complete", content: "已完成上一轮回答" },
        { type: "model.output_interrupted", content: "charCount=23" },
      ],
      gates: [{
        gateId: "gate-1",
        toolName: "save_resume_section",
        status: "approved",
        scopeHash: "scope-1",
        request: { toolName: "save_resume_section", args: { section: "summary" } },
        resolvedAt: "2026-08-24T10:01:00.000Z",
      }],
      factRefs: [{
        type: "tool_attempt",
        id: "attempt-1",
        version: "verified",
        hash: "args-hash",
      }],
    });
    expect(JSON.stringify(material)).not.toContain("张三");
    expect(JSON.stringify(material)).not.toContain("must not enter context");
  });
});
