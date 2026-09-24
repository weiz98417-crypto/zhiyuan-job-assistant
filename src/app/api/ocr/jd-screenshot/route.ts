import { NextResponse } from "next/server";
import { inspectDocumentImages, mapImageIntakeToJDLegacy } from "@/lib/server-image-intake";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const VALID_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { image?: unknown };
    if (typeof body.image !== "string" || !body.image) {
      return NextResponse.json({ success: false, error: "请提供图片数据" }, { status: 400 });
    }

    const mimeMatch = body.image.match(/^data:(image\/\w+);base64,/);
    if (!mimeMatch || !VALID_MIME_TYPES.has(mimeMatch[1])) {
      return NextResponse.json({ success: false, error: "仅支持 PNG、JPG、WebP 格式的图片" }, { status: 400 });
    }

    const base64Data = body.image.slice(body.image.indexOf(",") + 1);
    if (Math.ceil((base64Data.length * 3) / 4) > MAX_IMAGE_SIZE) {
      return NextResponse.json({ success: false, error: "图片大小不能超过 10MB" }, { status: 400 });
    }

    const intake = await inspectDocumentImages([body.image], {
      preferredDocumentType: "jd",
      signal: request.signal,
    });
    const mapped = mapImageIntakeToJDLegacy(intake);
    if (!mapped.body.trim()) {
      const timedOut = intake.errors?.some((error) => /ocr_timeout|超时|timeout/i.test(error))
        || /超时|timeout/i.test(intake.reason || "");
      return NextResponse.json({
        success: false,
        error: timedOut
          ? "图片识别超时。请重传清晰原图，或直接粘贴 JD 文字继续。"
          : "未能读出 JD 正文。请重传清晰原图，或直接粘贴 JD 文字继续。",
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...mapped,
        company: mapped.company || "【缺失】",
        role: mapped.role || "【缺失】",
        location: mapped.location || "【缺失】",
        salary: mapped.salary || "【缺失】",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片识别失败";
    console.error("[jd-screenshot] OCR failed:", message);
    return NextResponse.json(
      { success: false, error: "图片识别暂时失败。请直接粘贴 JD 文字继续。" },
      { status: 500 },
    );
  }
}
