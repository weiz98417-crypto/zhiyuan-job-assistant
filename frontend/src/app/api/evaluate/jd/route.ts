/* ── POST /api/evaluate/jd — 流式 JD 智能评估 ── */

import { createStructuredStream, checkApiKey } from "@/lib/stream-utils";

const EVALUATE_SYSTEM_PROMPT = `你是资深 HR 和求职顾问。对用户提供的职位描述进行深度评估。

按以下顺序输出，用标记包裹每个段落：

<<SUMMARY>>
用 2-3 句话概述这个岗位：公司阶段、岗位核心要求、市场竞争力。
<</SUMMARY>>

<<SCORES>>
JSON 格式的五维评分（0-100）：
{"skillMatch": 75, "experienceMatch": 68, "salaryMatch": 60, "growthSpace": 80, "riskIndex": 35}
- skillMatch: 技能匹配度（基于用户简历和JD要求对比）
- experienceMatch: 经验匹配度（年限、行业、项目类型）
- salaryMatch: 薪资匹配度（基于市场行情，无数据给50）
- growthSpace: 成长空间（岗位能带来的技能/职级/视野提升）
- riskIndex: 风险指数（越高越危险——公司稳定性、岗位真实性、加班文化等）
<</SCORES>>

<<RADAR>>
简短解释各维度评分依据，每维度一句话。
<</RADAR>>

<<SIGNALS>>
JSON 数组，识别 JD 中的行话暗语：
[
  {"phrase": "快速迭代", "translation": "加班频繁的可能性较高", "severity": "warning"},
  {"phrase": "扁平化管理", "translation": "晋升路径可能不清晰", "severity": "info"}
]
severity 取值：info（仅供参考）、warning（需要注意）、danger（需警惕）
如果 JD 中没有明显信号词，返回空数组。
<</SIGNALS>>

<<SUGGESTION>>
一句话行动建议，类似"这个岗位值得投，但面试时要问清汇报线和团队规模"。
根据匹配度给出建议：
- 高匹配(>70分)："值得投"开头 → 突出优势 + 面试注意点
- 中匹配(40-70)："可以投"开头 → 说明差距 + 如何弥补
- 低匹配(<40)："建议观望"开头 → 说明原因 + 替代方向
<</SUGGESTION>>

<<DONE>>

全程中文。评估客观冷静，不夸大不贬低。`;

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { jdText, cvText, userProfile } = body as {
      jdText: string;
      cvText?: string;
      userProfile?: {
        superpowers: string[];
        headline: string;
        targetRoles: { name: string; fit: string }[];
      };
    };

    if (!jdText || jdText.trim().length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: "JD 文本太短，请粘贴完整的职位描述（至少 50 字）" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const profileBlock = userProfile
      ? `求职者画像：\n- 核心优势：${userProfile.superpowers.join("、") || "未知"}\n- 职业定位：${userProfile.headline || "未知"}\n- 目标方向：${userProfile.targetRoles.map(r => r.name).join("、") || "未知"}\n`
      : "";

    const cvBlock = cvText
      ? `简历内容：\n${cvText.slice(0, 5000)}\n`
      : "（用户尚未上传简历，评分时请基于 JD 本身给出评估，技能/经验匹配度给基准分 50）\n";

    const userMessage = `${profileBlock}${cvBlock}\n请评估以下 JD：\n\n${jdText.slice(0, 8000)}`;

    const stream = createStructuredStream({
      systemPrompt: EVALUATE_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      max_tokens: 8000,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Evaluate JD stream error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `评估请求失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
