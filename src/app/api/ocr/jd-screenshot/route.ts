import { NextResponse } from "next/server";
import { ZHIPU_API_URL, ZHIPU_VISION_MODEL } from "@/lib/zhipu";
import { buildOCRImageCandidates } from "@/lib/server-image-variants";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface OCRResult {
  company: string;
  role: string;
  location: string;
  salary: string;
  skills: string[];
  body: string;
  isJD: boolean;
  reason?: string;
}

const SYSTEM_PROMPT = `你是一个专业的招聘 JD 图片识别助手。用户上传一张图片（可能是职位描述截图），你需要提取其中的结构化信息。

## 提取规则
1. 如果图片包含职位描述（JD），提取以下字段并以 JSON 格式返回
2. 如果图片不包含 JD（如风景照、自拍、聊天截图等），返回 { "isJD": false, "reason": "说明原因" }
3. 无法从图片中识别到的字段，填写 "【缺失】"（中文占位符）
4. skills 字段返回数组，如 ["React", "TypeScript", "Node.js"]
5. body 字段返回完整的 JD 正文原文，保留换行和段落结构

## 返回格式
{
  "company": "公司名称",
  "role": "职位名称",
  "location": "工作地点",
  "salary": "薪资范围（如 20-35K·14薪）",
  "skills": ["技能1", "技能2"],
  "body": "JD 正文全文...",
  "isJD": true
}`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { image: string };

    if (!body.image || typeof body.image !== "string") {
      return NextResponse.json(
        { success: false, error: "请提供图片数据" },
        { status: 400 }
      );
    }

    // Validate data URI prefix
    if (!body.image.startsWith("data:image/")) {
      return NextResponse.json(
        { success: false, error: "不支持的图片格式，请使用 PNG、JPG 或 WebP" },
        { status: 400 }
      );
    }

    // Extract MIME type
    const mimeMatch = body.image.match(/^data:(image\/\w+);base64,/);
    if (!mimeMatch || !VALID_MIME_TYPES.includes(mimeMatch[1])) {
      return NextResponse.json(
        { success: false, error: "仅支持 PNG、JPG、WebP 格式的图片" },
        { status: 400 }
      );
    }

    // Check size (base64 is ~4/3 of original)
    const base64Data = body.image.slice(body.image.indexOf(",") + 1);
    const estimatedSize = Math.ceil((base64Data.length * 3) / 4);
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { success: false, error: "图片大小不能超过 10MB" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OCR 服务未配置，请设置 ZHIPU_API_KEY 环境变量" },
        { status: 500 }
      );
    }

    const candidates = await buildOCRImageCandidates(body.image).catch(() => []);
    const imageForOCR = candidates[0]?.dataUri || body.image;

    const response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ZHIPU_VISION_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageForOCR },
              },
              {
                type: "text",
                text: "请识别这张图片中的职位描述信息，提取结构化字段。如果这不是 JD 图片请明确说明。",
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Zhipu OCR API error:", response.status, errText);
      return NextResponse.json(
        {
          success: false,
          error:
            response.status === 429
              ? "OCR 服务繁忙，请稍后重试"
              : `OCR 识别失败: ${response.status}`,
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "AI 未返回有效结果" },
        { status: 500 }
      );
    }

    let parsed: OCRResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          return NextResponse.json(
            { success: false, error: "AI 返回格式解析失败" },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { success: false, error: "AI 返回格式解析失败" },
          { status: 500 }
        );
      }
    }

    // Fill missing fields
    const result: OCRResult = {
      company: parsed.company || "【缺失】",
      role: parsed.role || "【缺失】",
      location: parsed.location || "【缺失】",
      salary: parsed.salary || "【缺失】",
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      body: parsed.body || "【缺失】",
      isJD: parsed.isJD !== false,
      reason: parsed.reason,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("OCR API error:", message);
    return NextResponse.json(
      { success: false, error: `OCR 识别失败: ${message}` },
      { status: 500 }
    );
  }
}
