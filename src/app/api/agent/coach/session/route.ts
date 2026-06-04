import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { addMemoryEvidence, createMemoryItem } from "@/lib/memory/postgres-memory";
import { createSession, nextAction, advance, getPhasePrompt } from "@/lib/agent/interview/engine";
import type { InterviewSession } from "@/lib/agent/interview/engine";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

const sessions = new Map<string, InterviewSession>();

function formatBoundContext(session: InterviewSession): string {
  const binding = session.sourceBinding;
  if (!binding) return "绑定上下文：未提供 JD/简历快照，请只问通用题。";
  const parts = [
    binding.jdId ? `JD id=${binding.jdId}` : "",
    binding.reportNum ? `report #${binding.reportNum}` : "",
    binding.resumeId ? `resume id=${binding.resumeId}` : "",
  ].filter(Boolean).join(", ");

  return [
    `绑定上下文：${parts || "inline snapshots"}`,
    binding.jdText ? `JD 快照：${binding.jdText.slice(0, 1800)}` : "",
    binding.cvText ? `简历快照：${binding.cvText.slice(0, 1800)}` : "",
    binding.memoryContext ? `长期记忆：${binding.memoryContext.slice(0, 1600)}` : "",
    "约束：后续每一道题都必须基于这些绑定快照，除非用户明确要求更换 JD/简历。",
  ].filter(Boolean).join("\n");
}

async function callJson(messages: Array<{ role: string; content: string }>, maxTokens = 600, temperature = 0.5) {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  return res.json();
}

async function askQuestion(session: InterviewSession): Promise<string> {
  const phasePrompt = getPhasePrompt(session);
  const prevQAs = session.answers
    .filter((answer) => answer.score != null)
    .map((answer) => `Q: ${answer.question}\nA: ${answer.answer}\n评分: ${answer.score}/10`);

  const data = await callJson([
    {
      role: "system",
      content: `你是 ${session.company} 的面试官，正在面试 ${session.role} 岗位。\n${phasePrompt}\n\n${formatBoundContext(session)}\n\n面试进度：\n${prevQAs.join("\n") || "面试刚开始"}\n\n请只提出一个问题。题目要简短说明考察点，并体现和 JD/简历的关系。只输出问题文本，不要一次性给多道题。`,
    },
    { role: "user", content: "请出下一题。" },
  ], 260, 0.7);

  return data.choices?.[0]?.message?.content?.trim() || "请用 1-2 分钟介绍一下你自己，并说明你和这个岗位最相关的一段经历。";
}

async function followUpQuestion(session: InterviewSession, lastAnswer: string): Promise<string> {
  const data = await callJson([
    {
      role: "system",
      content: `你是 ${session.company} 的面试官。\n${formatBoundContext(session)}\n\n候选人刚回答的问题：${session.currentQuestion?.text}\n候选人回答：${lastAnswer}\n\n请基于绑定 JD/简历提出一个追问，只输出一个问题。`,
    },
    { role: "user", content: "追问。" },
  ], 180, 0.6);

  return data.choices?.[0]?.message?.content?.trim() || "能否结合一个具体项目，把你的行动和结果再展开一下？";
}

async function scoreAnswer(session: InterviewSession, answer: string): Promise<{ score: number; feedback: string }> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你是资深面试官，正在面试 ${session.company} 的 ${session.role} 岗位。\n${formatBoundContext(session)}\n\n请对回答评分 1-10，并给出具体改进建议。严格输出 JSON：{"score": 数字, "feedback": "建议"}。`,
        },
        { role: "user", content: `题目: ${session.currentQuestion?.text}\n回答: ${answer}` },
      ],
      max_tokens: 420,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`评分失败: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return { score: Number(parsed.score) || 5, feedback: parsed.feedback || "请继续加强结构化表达。" };
  } catch {
    return { score: 5, feedback: content.slice(0, 200) };
  }
}

async function generateSummary(session: InterviewSession): Promise<string> {
  const scored = session.answers.filter((answer) => answer.score != null);
  const avgScore = scored.length
    ? (scored.reduce((sum, answer) => sum + (answer.score || 0), 0) / scored.length).toFixed(1)
    : "N/A";

  const data = await callJson([
    { role: "system", content: `你是 ${session.company} 的面试官。请基于绑定上下文和问答表现输出模拟面试总结。` },
    {
      role: "user",
      content: `${formatBoundContext(session)}\n\n面试岗位：${session.role}\n各题得分：\n${scored.map((answer) => `- ${answer.question.slice(0, 80)}: ${answer.score}/10`).join("\n")}\n\n平均分：${avgScore}/10\n\n请给出：整体评价、亮点、待改进、下一轮准备建议。`,
    },
  ], 700, 0.4);

  return data.choices?.[0]?.message?.content?.trim() || `面试完成，平均分 ${avgScore}/10。`;
}

async function persistInterviewSession(userId: string, session: InterviewSession, summary: string): Promise<number> {
  const title = `${session.company} ${session.role} 模拟面试`;
  return getDataRepositories().sessions.create({
    title,
    messages: [
      {
        role: "user",
        content: `模拟面试：${session.company} - ${session.role}`,
        mode: "interview-coach" as const,
        agent_id: "interview",
        timestamp: new Date().toISOString(),
      },
      {
        role: "assistant",
        content: summary,
        mode: "interview-coach" as const,
        agent_id: "interview",
        timestamp: new Date().toISOString(),
      },
    ],
    memoryDigest: summary.slice(0, 300),
    agentState: { sourceBinding: session.sourceBinding, answers: session.answers.length },
  }, userId);
}

async function writeInterviewObservation(userId: string, session: InterviewSession, answer: string, score: number, feedback: string) {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return;
  try {
    const itemId = await createMemoryItem({
      userId,
      memoryType: "interview_observation",
      canonicalText: `${session.company} ${session.role} interview answer scored ${score}/10: ${session.currentQuestion?.text || ""}`,
      status: "candidate",
      confidence: 0.6,
      importance: score < 6 ? 0.75 : 0.55,
      sourceCount: 1,
      metadata: { company: session.company, role: session.role, sourceBinding: session.sourceBinding, feedback },
    });
    await addMemoryEvidence({
      userId,
      memoryItemId: itemId,
      sourceType: "interview_answer",
      sourceId: session.id,
      quote: answer.slice(0, 800),
      extractionMethod: "interview_session_score",
      confidence: 0.6,
      metadata: { score, feedback },
    });
  } catch (error) {
    console.warn("[interview-session] memory writeback failed:", error);
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      sessionId,
      answer,
      company,
      role,
      jdId,
      reportNum,
      resumeId,
      jdText,
      cvText,
    } = body as {
      sessionId?: string;
      answer?: string;
      company?: string;
      role?: string;
      jdId?: number;
      reportNum?: number;
      resumeId?: number;
      jdText?: string;
      cvText?: string;
    };

    if (!sessionId) {
      if (!company || !role) {
        return NextResponse.json({ success: false, error: "请提供公司和岗位" }, { status: 400 });
      }

      const memory = await assembleAgentMemoryContext({
        userId: user.userId,
        task: "interview",
        query: `${company} ${role}\n${jdText || ""}\n${cvText || ""}`,
        budgetChars: 1400,
        semanticTopK: 5,
      });
      const session = createSession(company, role, {
        jdId,
        reportNum,
        resumeId,
        jdText: jdText?.slice(0, 4000),
        cvText: cvText?.slice(0, 4000),
        memoryContext: memory.llmSummary,
      });
      sessions.set(session.id, session);

      const question = await askQuestion(session);
      session.currentQuestion = { id: `q_${Date.now()}`, phase: session.phase, text: question, type: "tech" };
      sessions.set(session.id, session);

      return NextResponse.json({
        success: true,
        data: {
          sessionId: session.id,
          phase: session.phase,
          question,
          questionIndex: session.questionIndex,
          sourceBinding: session.sourceBinding,
        },
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return NextResponse.json({ success: false, error: "会话不存在或已过期" }, { status: 404 });
    }

    const action = nextAction(session, answer);
    switch (action) {
      case "followup": {
        const question = await followUpQuestion(session, answer!);
        session.currentFollowups.push(question);
        sessions.set(session.id, session);
        return NextResponse.json({ success: true, data: { action: "followup", question, sourceBinding: session.sourceBinding } });
      }

      case "score": {
        const { score, feedback } = await scoreAnswer(session, answer!);
        await writeInterviewObservation(user.userId, session, answer!, score, feedback);
        session.answers.push({
          questionId: session.currentQuestion?.id || "",
          question: session.currentQuestion?.text || "",
          answer: answer!,
          score,
          feedback,
          followups: [],
        });

        advance(session);
        if (session.phase === "done") {
          const summary = await generateSummary(session);
          const storedSessionId = await persistInterviewSession(user.userId, session, summary);
          sessions.delete(session.id);
          return NextResponse.json({
            success: true,
            data: {
              action: "done",
              summary,
              sessionId: storedSessionId,
              sourceBinding: session.sourceBinding,
              answers: session.answers.map((item) => ({
                question: item.question,
                answer: item.answer,
                score: item.score,
                feedback: item.feedback,
              })),
            },
          });
        }

        const nextQuestion = await askQuestion(session);
        session.currentQuestion = {
          id: `q_${Date.now()}`,
          phase: session.phase,
          text: nextQuestion,
          type: session.phase === "behavioral" ? "behavioral" : session.phase === "reverse" ? "reverse" : "tech",
        };
        sessions.set(session.id, session);

        return NextResponse.json({
          success: true,
          data: {
            action: "next",
            phase: session.phase,
            question: nextQuestion,
            questionIndex: session.questionIndex,
            previousScore: score,
            previousFeedback: feedback,
            sourceBinding: session.sourceBinding,
          },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ success: false, error: `面试引擎错误: ${message}` }, { status: 500 });
  }
}
