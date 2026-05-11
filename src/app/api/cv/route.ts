import { NextResponse } from "next/server";

interface CVSection {
  id: string;
  title: string;
  content: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sections } = body as { sections?: CVSection[] };

    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json(
        { success: true, data: { sections: [], fullText: "", isEmpty: true } }
      );
    }

    const fullText = sections
      .filter((s) => s.content?.trim())
      .map((s) => `【${s.title}】\n${s.content}`)
      .join("\n\n");

    const isEmpty = fullText.trim().length === 0;

    return NextResponse.json({
      success: true,
      data: { sections, fullText, isEmpty },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `CV 数据处理失败: ${message}` },
      { status: 500 }
    );
  }
}
