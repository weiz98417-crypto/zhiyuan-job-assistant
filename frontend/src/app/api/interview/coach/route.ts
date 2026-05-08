/* ── POST /api/interview/coach — 回答教练（六种模式） ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";
import type { CoachMode } from "@/types";
import { COACH_MODES } from "@/types";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { experience, mode } = body as {
      experience: string;
      mode: CoachMode;
    };

    if (!experience || experience.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "请输入你的经历描述（至少 10 字）" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const modeInfo = COACH_MODES[mode] || COACH_MODES["project-review"];
    const structureStr = modeInfo.structure.join("→");

    const modeExtraContext: Record<CoachMode, string> = {
      "project-review": "偏好数据驱动、产品感、快节奏决策。追问侧重：数据验证方式、跨团队协作、复盘反思深度。",
      "behavioral": "遵循标准 STAR+R 框架。追问侧重：你具体做了什么（不是团队做了什么）、结果的可衡量性、学到的经验。",
      "scenario": "考察逻辑框架和应变能力。追问侧重：你如何定义问题、有无其他方案、如何评估风险。",
      "structured-sme": "HR 懂业务、追细节、看重稳定性和即战力。追问侧重：你离开上家的真实原因、对加班的看法、期望管理风格。",
      "founder": "关注多面手能力和创业心态。追问侧重：你对公司业务的理解、你能立刻做什么、薪资期望灵活性。附带风险提示：口头承诺不靠谱、期权兑现可能性、社保缴纳情况。",
      "stability": "不看框架看'味道'。追问侧重：家庭背景、政治面貌、对稳定性的看重程度。弱化个人英雄主义，强化服从和执行力。",
    };

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是资深面试教练，专门帮助求职者按照指定的面试模式组织回答。

当前面试模式：${modeInfo.label}（${modeInfo.target}）
回答结构：${structureStr}

${modeExtraContext[mode] || ""}

将用户的经历按上述结构重组，每一部分独立输出。对 AI 推断的部分用 [推断] 标注。
生成 3-5 个面试官可能的追问，每个追问附带简短的回答要点提示。
${mode === "founder" ? "额外生成 2-3 条风险识别提示，标注为 riskWarnings。" : ""}

返回 JSON：
{
  "sections": [
    {"key": "background", "label": "背景", "content": "..."},
    {"key": "role", "label": "角色", "content": "..."}
  ],
  "followUps": [
    {"question": "你在项目中遇到的最大困难是什么？", "hint": "选一个有具体解决方案的困难，不要选团队协作类"}
  ],
  "riskWarnings": ["口头承诺的期权兑现率通常不到30%"]
}
sections 的 key 使用英文小写。label 使用中文。
riskWarnings 仅在 founder 模式下可能非空，其他模式返回空数组。
只用中文。`,
        },
        {
          role: "user",
          content: `面试模式：${modeInfo.label}\n我的经历：\n${experience.slice(0, 5000)}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 6000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sections: (parsed.sections as Array<{ key: string; label: string; content: string }>) || [],
          followUps: (parsed.followUps as Array<{ question: string; hint: string }>) || [],
          riskWarnings: (parsed.riskWarnings as string[]) || [],
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Interview coach error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `教练生成失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
