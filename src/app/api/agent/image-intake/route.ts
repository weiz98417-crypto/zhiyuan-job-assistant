import { NextResponse } from "next/server";
import { inspectDocumentImages } from "@/lib/server-image-intake";
import type { ImageDocumentType } from "@/lib/agent/image-intake";

function normalizePreferred(value: unknown): ImageDocumentType | undefined {
  if (
    value === "jd" ||
    value === "offer" ||
    value === "resume" ||
    value === "chat_screenshot" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      images?: unknown;
      userText?: unknown;
      preferredDocumentType?: unknown;
    };

    const images = Array.isArray(body.images)
      ? body.images.filter((item): item is string => typeof item === "string")
      : [];

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: "images required" },
        { status: 400 },
      );
    }

    const data = await inspectDocumentImages(images, {
      userText: typeof body.userText === "string" ? body.userText : "",
      preferredDocumentType: normalizePreferred(body.preferredDocumentType),
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "图片识别失败";
    console.error("[image-intake] failed:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
