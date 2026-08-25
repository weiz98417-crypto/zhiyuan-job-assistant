import { getCurrentUser } from "@/lib/auth";
import { generateInterviewQuestionsForAgent } from "@/lib/server/interview-analysis-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      jdText?: string;
      cvText?: string;
      company?: string;
      role?: string;
      companyPreset?: string;
      storiesContext?: Array<{ title?: string; situation?: string; action?: string; result?: string }>;
    };
    if (!body.company && !body.role && !body.jdText) {
      return Response.json({ success: false, error: "请至少提供 JD 文本或公司/岗位信息" }, { status: 400 });
    }
    const presetContexts: Record<string, string> = {
      bytedance: "字节跳动风格：侧重数据驱动、A/B 测试、快节奏决策和结果导向。",
      tencent: "腾讯风格：侧重产品感、用户体验、社交生态理解和长期主义。",
      alibaba: "阿里巴巴风格：侧重价值观、执行力、业务闭环和拥抱变化。",
    };
    const stories = (body.storiesContext || []).slice(0, 5).map((story, index) =>
      `${index + 1}. ${story.title || "故事"}：背景 ${String(story.situation || "").slice(0, 200)}；行动 ${String(story.action || "").slice(0, 200)}；结果 ${String(story.result || "").slice(0, 200)}`,
    ).join("\n");
    const result = await generateInterviewQuestionsForAgent(
      { userId: user.userId },
      {
        jdText: body.jdText,
        cvText: body.cvText,
        company: body.company,
        role: body.role,
        count: 10,
        additionalContext: [body.companyPreset ? presetContexts[body.companyPreset] : "", stories].filter(Boolean).join("\n"),
      },
      { signal: request.signal },
    );
    return Response.json({ success: true, data: { questions: result.questions } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const status = /auth|登录|token/i.test(message) ? 401 : 500;
    return Response.json({ success: false, error: `题目生成失败: ${message}` }, { status });
  }
}
