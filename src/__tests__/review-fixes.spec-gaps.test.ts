import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { composeStagingJudgeResult, scoreAgentOutput, type QualityScorerName } from "@/lib/agent/llm-scorers";
import { judgeStagingOutput } from "@/lib/agent/staging-judge";
import { aggregateAgentReleaseGates, type AgentEvalLayerResult, type AgentReleaseManifest } from "@/lib/agent/eval-release-gates";
import { admitScheduledDigestRun } from "@/lib/agent/run-admission";
import { isToolAllowedInMode } from "@/lib/agent/loop/tool-policy";
import { ToolRegistry } from "@/lib/agent/tools/registry";
import { createGetJobDigestTool, buildJobDigestMaterial } from "@/lib/agent/tools/query/get-job-digest";
import type { ChatCompletionRequest, ChatResult } from "@/lib/ai/model-gateway";
import type { ToolExecutionContext } from "@/lib/agent/tools/types";

const FABRICATED_OUTPUT = "建议突出你曾在字节跳动担任高级产品经理三年的经历。";
const RESUME_SOURCE = "2020-2023 阿里巴巴 前端工程师。";

function judgeFake(hallucinationResponse: string) {
  return async (request: ChatCompletionRequest): Promise<ChatResult> => {
    const isHallucination = /fabrication detector/.test(request.systemPrompt || "");
    return {
      text: isHallucination ? hallucinationResponse : '{"score": 1, "reason": "ok"}',
      toolCalls: [],
      modelUsed: "fake-judge",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  };
}

describe("Spec 15 gate level: hallucinated resume output refuses release via aggregateAgentReleaseGates", () => {
  it("turns the composed judge veto into a hard gate failure", async () => {
    const quality = await scoreAgentOutput(
      { taskType: "resume_edit", output: FABRICATED_OUTPUT, sourceMaterials: [RESUME_SOURCE] },
      { complete: judgeFake('{"score": 0.05, "fabricated": [{"item": "字节跳动", "reason": "源材料无"}], "reason": "编造经历"}') },
    );
    const composed = composeStagingJudgeResult(
      judgeStagingOutput({ taskType: "resume_edit", output: FABRICATED_OUTPUT }),
      quality,
    );
    expect(composed.releaseAllowed).toBe(false);

    const manifest: AgentReleaseManifest = {
      version: "test",
      codeCommit: "test",
      programVersions: {},
      entries: [{ module: "journey", requiredLayers: ["E"], fixtureIds: ["fabrication-fixture"], commandCategories: [], environment: "staging", owner: "test" }],
    };
    const layerResults: AgentEvalLayerResult[] = [
      { layer: "E", passed: composed.releaseAllowed, deterministic: true, failures: composed.releaseAllowed ? [] : ["fabricated_experience"], score: composed.score },
    ];
    const gates = aggregateAgentReleaseGates({ manifest, results: layerResults });
    expect(gates.passed).toBe(false);
    expect(gates.hardFailures.join(";")).toContain("fabricated_experience");
  });
});

describe("Spec 19 behavior: unattended read-only contract denies write tools", () => {
  it("allowlist admits only the digest tool (plus global context reads), never write tools", () => {
    const admission = admitScheduledDigestRun();
    const allowlist = admission.contract?.routing?.allowedTools || [];
    expect(isToolAllowedInMode("get_job_digest", allowlist)).toBe(true);
    expect(isToolAllowedInMode("save_resume_section", allowlist)).toBe(false);
    expect(isToolAllowedInMode("apply_resume_edit_proposal", allowlist)).toBe(false);
    expect(isToolAllowedInMode("update_application_status", allowlist)).toBe(false);
    // 全局上下文工具也全部是 read-effect，契约保持只读。
    expect(allowlist.every((name) => name === "get_job_digest")).toBe(true);
  });

  it("registry execution denies an off-allowlist write tool before any handler runs", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(async () => ({ success: true, data: null, errorCategory: "ok" as const }));
    registry.register({
      name: "save_resume_section",
      description: "write tool",
      category: "action",
      parameters: {},
      handler,
      formatResult: () => "ok",
    });
    const context: ToolExecutionContext = {
      principal: { userId: "user-1" },
      runId: "run-1",
      allowlist: ["get_job_digest"],
    };
    const result = await registry.execute("save_resume_section", {}, context);
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe("permanent");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Spec 19: digest tool reads watermark and scopes by user", () => {
  it("passes the watermark since/note from the scheduler into the material", async () => {
    const tool = createGetJobDigestTool({
      watermark: async () => ({ since: "2026-09-28T00:00:00.000Z", note: "上周精选失败，本期已补跑" }),
    });
    const result = await tool.handler({}, { principal: { userId: "user-42" }, runId: "run-1", allowlist: ["get_job_digest"] } as ToolExecutionContext);
    expect(result.success).toBe(true);
    const material = result.data as Awaited<ReturnType<typeof buildJobDigestMaterial>>;
    expect(material.since).toBe("2026-09-28T00:00:00.000Z");
    expect(material.schedulerNote).toBe("上周精选失败，本期已补跑");
  });

  it("rejects the call loudly without a principal instead of guessing a user", async () => {
    const tool = createGetJobDigestTool();
    const result = await tool.handler({}, undefined as unknown as ToolExecutionContext);
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe("permanent");
  });
});

describe("Spec 14 static assertions: dead seams stay dead", () => {
  const srcRoot = resolve(__dirname, "..", "lib");

  it("feature-flags.ts is gone and no module imports it", () => {
    const { existsSync, readdirSync } = require("fs") as typeof import("fs");
    expect(existsSync(resolve(srcRoot, "agent", "feature-flags.ts"))).toBe(false);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && readFileSync(full, "utf-8").includes("agent/feature-flags")) offenders.push(full);
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });

  it("no silent mock-embedding fallback marker remains in src", () => {
    const adapter = readFileSync(resolve(srcRoot, "memory", "mastra-adapter.ts"), "utf-8");
    expect(adapter).not.toContain("zhiyuan-mastra-fallback");
  });
});
