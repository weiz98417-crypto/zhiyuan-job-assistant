import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { createSession, nextAction, advance, getPhasePrompt, shouldFollowUp } from "@/lib/agent/interview/engine";
import type { InterviewSession } from "@/lib/agent/interview/engine";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

// In-memory session store (replace with SQLite in production)
const sessions = new Map<string, InterviewSession>();

async function askQuestion(session: InterviewSession): Promise<string> {
  const phasePrompt = getPhasePrompt(session);
  const prevQAs = session.answers
    .filter((a) => a.score != null)
    .map((a) => `Q: ${a.question}\nA: ${a.answer}\n评分: ${a.score}/10`);

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: `你是${session.company}的面试官，正在面试${session.role}岗位。${phasePrompt}\n\n面试进度：\n${prevQAs.join("\n") || "面试刚开始"}\n\n请提出一个问题。只输出问题文本，不加任何前缀。`,
        },
        { role: "user", content: "请出题" },
      ],
      max_tokens: 200,
      temperature: 0.8,
    }),
  });

  if (!res.ok) throw new Error(`生成题目失败: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "请简单介绍一下你自己";
}

async function followUpQuestion(session: InterviewSession, lastAnswer: string): Promise<string> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: `你是${session.company}的面试官。候选人刚回答了这道题："${session.currentQuestion?.text}"\n候选人的回答："${lastAnswer}"\n这个回答有值得深入挖掘的点。请提出一个追问，只输出问题文本。`,
        },
        { role: "user", content: "追问" },
      ],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`追问生成失败: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "能否再详细说说？";
}

async function scoreAnswer(session: InterviewSession, answer: string): Promise<{ score: number; feedback: string }> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: `你是${session.company}的面试官，面试${session.role}岗位。对以下回答评分（1-10），并给出具体改进建议。以JSON格式输出：{"score": 数字, "feedback": "建议"}。只输出JSON。`,
        },
        { role: "user", content: `题目: ${session.currentQuestion?.text}\n回答: ${answer}` },
      ],
      max_tokens: 300,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`评分失败: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return { score: parsed.score || 5, feedback: parsed.feedback || "请继续努力" };
  } catch {
    return { score: 5, feedback: content.slice(0, 200) };
  }
}

async function generateSummary(session: InterviewSession): Promise<string> {
  const scored = session.answers.filter((a) => a.score != null);
  const avgScore = scored.length > 0
    ? (scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length).toFixed(1)
    : "N/A";

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: `你是${session.company}的面试官。面试已结束，请给出综合评估。`,
        },
        {
          role: "user",
          content: `面试${session.role}岗位。各题得分：\n${scored.map((a) => `- ${a.question.slice(0, 50)}... : ${a.score}/10`).join("\n")}\n\n平均分: ${avgScore}/10\n\n请给出：1)整体评价 2)亮点 3)待改进 4)是否推荐进入下一轮`,
        },
      ],
      max_tokens: 500,
      temperature: 0.5,
    }),
  });
  if (!res.ok) throw new Error(`总结失败: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || `面试完成，平均分 ${avgScore}/10`;
}

async function persistInterviewSession(userId: string, session: InterviewSession, summary: string): Promise<number> {
  const title = `${session.company} ${session.role} 面试模拟`;
  const messages = [
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
  ];

  return getDataRepositories().sessions.create({
    title,
    messages,
    memoryDigest: summary.slice(0, 300),
  }, userId);
}

export async function POST(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }); }

    const body = await request.json();
    const { sessionId, answer, company, role } = body as {
      sessionId?: string;
      answer?: string;
      company?: string;
      role?: string;
    };

    // Start new session
    if (!sessionId) {
      if (!company || !role) {
        return NextResponse.json({ success: false, error: "请提供公司和岗位" }, { status: 400 });
      }
      const session = createSession(company, role);
      sessions.set(session.id, session);

      const question = await askQuestion(session);
      session.currentQuestion = { id: `q_${Date.now()}`, phase: session.phase, text: question, type: "tech" };
      sessions.set(session.id, session);

      return NextResponse.json({
        success: true,
        data: { sessionId: session.id, phase: session.phase, question, questionIndex: session.questionIndex },
      });
    }

    // Continue existing session
    const session = sessions.get(sessionId);
    if (!session) {
      return NextResponse.json({ success: false, error: "会话不存在或已过期" }, { status: 404 });
    }

    const action = nextAction(session, answer);

    switch (action) {
      case "followup": {
        const fuq = await followUpQuestion(session, answer!);
        session.currentFollowups.push(fuq);
        sessions.set(session.id, session);
        return NextResponse.json({ success: true, data: { action: "followup", question: fuq } });
      }

      case "score": {
        const { score, feedback } = await scoreAnswer(session, answer!);
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
              answers: session.answers.map((a) => ({ question: a.question, answer: a.answer, score: a.score, feedback: a.feedback })),
            },
          });
        }

        const nextQ = await askQuestion(session);
        session.currentQuestion = { id: `q_${Date.now()}`, phase: session.phase, text: nextQ, type: session.phase === "tech" ? "tech" : session.phase === "behavioral" ? "behavioral" : "reverse" };
        sessions.set(session.id, session);

        return NextResponse.json({
          success: true,
          data: {
            action: "next",
            phase: session.phase,
            question: nextQ,
            questionIndex: session.questionIndex,
            previousScore: score,
            previousFeedback: feedback,
          },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ success: false, error: `面试引擎错误: ${msg}` }, { status: 500 });
  }
}
