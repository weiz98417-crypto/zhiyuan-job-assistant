import { NextResponse } from "next/server";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

/* ── LLM knowledge lookup ── */
async function llmKnowledgeLookup(query: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `你是中国企业信息检索专家。请根据你的训练数据，提供关于查询对象的**详细事实信息**。

输出格式：每条一行，用"- "开头。

规则【必须遵守】：
1. 先列基本信息：公司全称(中英文)、成立年份、总部地点、员工规模
2. 再列业务：主营业务、核心产品/技术、行业地位
3. 再列动态：近期融资/上市/扩张/招聘方向
4. 每条信息必须完整写清，不要截断关键词（如"数字孪生"不能写成"数字生"）
5. 数字尽量具体（如"2000+人"而非"规模较大"）
6. 不确定的信息**必须标注"[存疑]"**
7. 完全不了解的方面直接跳过，不要编造
8. 每条不超过150字，总共不超过12条
9. 中文输出
10. 如果查询对象是公司名，只输出该公司信息，拒绝同名影视/小说/游戏`,
          },
          { role: "user", content: query },
        ],
        temperature: 0.05,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    return content === "无相关信息" ? "" : content;
  } catch {
    return "";
  }
}

/* ── Route: GET /api/agent/search?q=... ── */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  if (!query) {
    return NextResponse.json({ success: false, error: "缺少搜索关键词" }, { status: 400 });
  }

  const text = await llmKnowledgeLookup(query);

  if (!text) {
    return NextResponse.json({ success: true, data: "未找到相关结果", sources: [] });
  }

  return NextResponse.json({ success: true, data: text, sources: ["AI知识库"] });
}
