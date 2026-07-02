import type { ToolDefinition, ToolResult } from "../types";
import { loadSOP, initSOP, advanceStage, getStagePrompt, clearSOP } from "@/lib/agent/profile-sop";
import { triggerProfileUpdate } from "@/lib/profile-update";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const action = (params.action as string) || "start";

  if (action === "start") {
    const existing = loadSOP();
    const stage = existing ? existing.stage : 0;

    // If SOP already exists, tell the model to NOT call start again — use answer instead
    const alreadyStarted = !!existing;

    return {
      success: true,
      data: {
        stage,
        branch: existing?.branch || null,
        prompt: getStagePrompt(stage, existing?.branch),
        isResume: alreadyStarted && stage > 0,
        alreadyStarted,
        collected: existing?.collected || {},
        hasGoals: false,
        hint: alreadyStarted
          ? "SOP 已启动，请直接展示当前引导问题，不要再调用 start。用户回答后调用 mine_profile(action=\"answer\", answer=\"用户原文\")。"
          : "SOP 已初始化。展示引导问题给用户。用户回答后调用 mine_profile(action=\"answer\")。",
      },
    };
  }

  if (action === "stage_prompt") {
    const existing = loadSOP();
    const stage = existing ? existing.stage : 0;
    return {
      success: true,
      data: {
        stage,
        branch: existing?.branch || null,
        prompt: getStagePrompt(stage, existing?.branch),
      },
    };
  }

  if (action === "answer") {
    const answer = (params.answer as string) || "";
    if (!answer.trim()) {
      return { success: false, data: null, error: "请提供你的回答" };
    }

    let state = loadSOP();
    if (!state) state = initSOP();

    advanceStage(state, answer);

    // Trigger profile update after each stage (client-side, background, non-blocking)
    triggerProfileUpdate().catch(() => {});

    if (state.stage === 5) {
      // Write goals through the profile API; the API owns the active storage backend.
      try {
        await fetch("/api/data/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goals: {
              targetRoles: state.collected,
              confirmedAt: new Date().toISOString(),
            },
          }),
        });
      } catch { /* best effort */ }

      clearSOP();
      return {
        success: true,
        data: {
          stage: 5,
          done: true,
          summary: "画像已生成！可在 /profile 页面查看求职画像和进化轨迹。",
        },
      };
    }

    return {
      success: true,
      data: {
        stage: state.stage,
        branch: state.branch,
        prompt: getStagePrompt(state.stage, state.branch),
        collected: state.collected,
      },
    };
  }

  if (action === "complete") {
    const state = loadSOP();
    if (state) {
      // Write goals through the profile API; the API owns the active storage backend.
      try {
        const goals: Record<string, unknown> = {
          targetRoles: [],
          confirmedAt: new Date().toISOString(),
        };

        // Extract role preferences from collected data
        for (const [key, value] of Object.entries(state.collected)) {
          if (typeof value === "string" && (value.includes("方向") || value.includes("岗位") || value.includes("想做"))) {
            // Simple extraction — the agent should structure this better
          }
        }

        // Write goals + signal through the profile APIs.
        await fetch("/api/data/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goals }),
        });

        // Also record the signal
        await fetch("/api/data/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "dingwei",
            signal_type: "role_preference",
            content_json: { data: state.collected, branch: state.branch },
          }),
        });
      } catch { /* best effort */ }

      clearSOP();
    }

    // Trigger full profile update
    triggerProfileUpdate({ force: true }).catch(() => {});

    return {
      success: true,
      data: {
        done: true,
        summary: "定位已保存！画像已更新。可在 /profile 页面查看。",
      },
    };
  }

  if (action === "reset") {
    clearSOP();
    return { success: true, data: { reset: true } };
  }

  return { success: false, data: null, error: `Unknown action: ${action}` };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `操作失败: ${result.error}`;
  const d = result.data as Record<string, unknown> | null;
  if (!d) return "操作完成";
  if (d.reset) return "SOP 已重置";
  if (d.done) return `画像挖掘完成！${d.summary || ""}`;
  if (d.alreadyStarted) return `[阶段 ${d.stage}/5 — 继续] ${d.prompt || ""}（不要在同一个回合内再次调用 start）`;
  return `[阶段 ${d.stage}/5] ${d.prompt || ""}`;
}

export const mineProfile: ToolDefinition = {
  name: "mine_profile",
  description: "启动或推进求职画像挖掘 SOP 流程。action=start 开始/恢复，action=answer 提交回答，action=stage_prompt 获取当前阶段引导语，action=complete 触发画像写入，action=reset 重置",
  parameters: {
    action: { type: "string", required: true, description: "操作: start（开始/继续），answer（提交当前阶段回答），stage_prompt（获取当前阶段引导语），complete（完成并写入画像），reset（重置）" },
    answer: { type: "string", required: false, description: "当 action=answer 时，用户对当前阶段问题的回答" },
  },
  category: "action",
  handler,
  formatResult,
};
