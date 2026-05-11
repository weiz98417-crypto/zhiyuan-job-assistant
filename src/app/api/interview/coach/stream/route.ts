/* ── POST /api/interview/coach/stream — 多轮流式教练对话 SSE ── */

import { checkApiKey, streamDeepSeekChunks, extractSectionsFromBuffer } from "@/lib/stream-utils";
import type { CoachMode, CoachMessage, QuestionPracticeContext } from "@/types";
import { COACH_MODES } from "@/types";

const DEFAULT_MODEL = "deepseek-v4-flash";

const MODE_EXTRA_CONTEXT: Record<CoachMode, string> = {
  "project-review": "偏好数据驱动、产品感、快节奏决策。追问侧重：数据验证方式、跨团队协作、复盘反思深度。",
  "behavioral": "遵循标准 STAR+R 框架。追问侧重：你具体做了什么（不是团队做了什么）、结果的可衡量性、学到的经验。",
  "scenario": "考察逻辑框架和应变能力。追问侧重：你如何定义问题、有无其他方案、如何评估风险。",
  "structured-sme": "HR 懂业务、追细节、看重稳定性和即战力。追问侧重：你离开上家的真实原因、对加班的看法、期望管理风格。",
  "founder": "关注多面手能力和创业心态。追问侧重：你对公司业务的理解、你能立刻做什么、薪资期望灵活性。附带风险提示。",
  "stability": "不看框架看'味道'。追问侧重：家庭背景、政治面貌、对稳定性的看重程度。弱化个人英雄主义，强化服从和执行力。",
};

function buildSystemPrompt(mode: CoachMode, questionContext?: QuestionPracticeContext): string {
  const info = COACH_MODES[mode];
  const structureStr = info.structure.join("→");
  const extra = MODE_EXTRA_CONTEXT[mode] || "";

  const basePrompt = `你是资深面试教练，专门帮助求职者按照指定的面试模式组织回答。支持多轮对话。

当前面试模式：${info.label}（${info.target}）
回答结构：${structureStr}

${extra}`;

  const contextBlock = questionContext
    ? `\n**当前练习的面试题目**：${questionContext.question}
**考察意图**：${questionContext.context}
**准备提示**：${questionContext.storyHint}
**JD 摘要**：${questionContext.jdSummary || "无"}
**简历摘要**：${questionContext.cvSummary || "无"}

请围绕这道具体题目评估用户的回答并进行指导。你需要：
1. 按回答结构逐段分析用户的回答，给出改进建议
2. 指出回答中的亮点和不足
3. 针对这道题的具体考察点，给出追问
4. 如果用户的回答偏离了题目，温和地引导回正轨`
    : "";

  const formatBlock = `
输出格式（严格遵循）：
对每个结构元素，输出一个章节块：
<<SECTION>>
### 中文标题
<章节正文内容，一段或多段>
<</SECTION>>

每章节用 <<SECTION>> 开始、<</SECTION>> 结束。
章节内部第一行用 ### 标注中文标题。

所有章节输出完毕后，生成 3-5 个面试官可能的追问：
<<FOLLOWUPS>>
[{"question": "...", "hint": "简短回答提示"}, ...]
<</FOLLOWUPS>>

${mode === "founder" ? "在 FOLLOWUPS 之后额外输出：<<RISKWARNINGS>>\\n[\"风险1\", \"风险2\"]\\n<</RISKWARNINGS>>\\n" : ""}
最后输出：
<<DONE>>

规则：
- 如果是首轮对话（只有 system + 1条 user message），按上述结构完整输出
- 如果是后续轮次（有历史对话），基于上下文深入追问或补充信息，输出相关章节+追问
- 用户可能要求你切换为面试官角色提出追问，此时只提问不给答案，等用户回答后再切回教练角色评分
- 全部使用中文`;

  return basePrompt + contextBlock + formatBlock;
}

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { messages, mode, questionContext } = body as {
      messages: CoachMessage[];
      mode: CoachMode;
      questionContext?: QuestionPracticeContext;
    };

    if (!messages || messages.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: "请至少提供 system + user 消息" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = buildSystemPrompt(mode, questionContext);

    const apiMessages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content.slice(0, 5000) })),
    ];

    // Limit history to ~15 messages (plus system)
    if (apiMessages.length > 16) {
      const trimmed = [apiMessages[0], ...apiMessages.slice(-15)];
      apiMessages.length = 0;
      apiMessages.push(...trimmed);
    }

    const encoder = new TextEncoder();
    const emittedSections = new Set<string>();
    let buffer = "";
    let followUpsEmitted = false;
    let doneEmitted = false;

    const stream = new ReadableStream({
      async start(controller) {
        const enqueueEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        await streamDeepSeekChunks(
          {
            model: DEFAULT_MODEL,
            messages: apiMessages,
            temperature: 0.5,
            max_tokens: 6000,
          },
          {
            onContent: (content) => {
              buffer += content;

              // Extract completed sections
              const sections = extractSectionsFromBuffer(buffer, emittedSections);
              for (const sec of sections) {
                enqueueEvent("section", { key: sec.key, label: sec.label, content: sec.content });
              }

              // Extract followUps once
              if (!followUpsEmitted) {
                const fuResult = tryExtractFollowUps(buffer);
                if (fuResult) {
                  followUpsEmitted = true;
                  enqueueEvent("followUps", {
                    questions: fuResult.questions,
                    riskWarnings: fuResult.riskWarnings,
                  });
                }
              }

              // Extract DONE
              if (!doneEmitted && buffer.includes("<<DONE>>")) {
                doneEmitted = true;
                enqueueEvent("done", {});
              }
            },
            onDone: () => {
              // Raw fallback: if no structured sections were emitted, send raw buffer
              if (emittedSections.size === 0 && buffer.trim()) {
                enqueueEvent("section", {
                  key: "raw",
                  label: "AI 反馈",
                  content: buffer.trim(),
                });
              }
              if (!doneEmitted) {
                doneEmitted = true;
                enqueueEvent("done", {});
              }
              controller.close();
            },
            onError: (status) => {
              enqueueEvent("error", { error: `AI 请求失败: ${status}` });
              controller.close();
            },
          },
        );
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Interview coach stream error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `教练流式生成失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/* ── FollowUps / RiskWarnings extraction (coach-specific, kept here) ── */

function tryExtractFollowUps(
  buffer: string,
): { questions: { question: string; hint: string }[]; riskWarnings: string[] } | null {
  const fuMatch = buffer.match(/<<FOLLOWUPS>>\s*([\s\S]*?)\s*<<\/FOLLOWUPS>>/);
  if (!fuMatch) return null;

  let riskWarnings: string[] = [];
  const rwMatch = buffer.match(/<<RISKWARNINGS>>\s*([\s\S]*?)\s*<<\/RISKWARNINGS>>/);
  if (rwMatch) {
    try {
      riskWarnings = JSON.parse(rwMatch[1].trim());
    } catch {
      // ignore parse failures
    }
  }

  try {
    const questions = JSON.parse(fuMatch[1].trim());
    if (Array.isArray(questions)) {
      return { questions, riskWarnings };
    }
  } catch {
    // ignore parse failures
  }
  return null;
}
