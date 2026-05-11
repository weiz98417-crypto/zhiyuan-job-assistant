import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { cvText } = await request.json();
    if (!cvText || typeof cvText !== "string" || cvText.trim().length < 50) {
      return NextResponse.json({ success: false, error: "CV 文本不足 50 字符" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, error: "未配置 API Key" }, { status: 500 });

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: `你是 ATS（求职者追踪系统）兼容性检查专家。分析以下简历，输出 JSON：
{
  "issues": [
    { "dimension": "联系方式|量化数据|关键词|section完整性|格式", "severity": "critical|warning|info", "detail": "具体问题", "fix": "修复建议" }
  ],
  "score": 0-100
}
检查清单：
- 联系方式：电话/邮箱/LinkedIn 是否齐全
- 量化数据：是否有数字/百分比/具体指标
- 关键词：是否覆盖目标岗位核心关键词
- section完整性：摘要/经历/项目/教育/技能 5 个部分是否都有内容
- 格式：是否有表格/图片/特殊符号（ATS 无法解析）
只输出 JSON。`,
          },
          { role: "user", content: cvText.slice(0, 6000) },
        ],
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `ATS 检查失败: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: { issues?: Array<{ dimension: string; severity: string; detail: string; fix: string }>; score?: number };
    try { parsed = JSON.parse(content); } catch { parsed = { issues: [], score: 0 }; }

    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
