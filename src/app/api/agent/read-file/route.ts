/**
 * Server-side file reader for the native read_file agent tool.
 *
 * Modeled after Cursor Agent's read_file: server-side execution,
 * path whitelisting, encoding corruption detection, mandatory output
 * capping. The agent never reads raw filesystem directly.
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isGarbledText } from "@/lib/agent/loop/text-quality";

const ALLOWED_EXTENSIONS = new Set([".md", ".yml", ".yaml", ".json", ".txt"]);
const MAX_CHARS = 2000;
const PROJECT_ROOT = path.resolve(process.cwd());

function isAllowedExt(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function isPathTraversal(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return normalized.includes("..") || path.isAbsolute(filePath);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({
        success: false,
        error: "缺少 path 参数",
        errorCategory: "need_user_input",
      });
    }

    // Security: block path traversal
    if (isPathTraversal(filePath)) {
      return NextResponse.json({
        success: false,
        error: "不支持的文件路径",
        errorCategory: "permanent",
      });
    }

    // Security: whitelist extensions
    if (!isAllowedExt(filePath)) {
      return NextResponse.json({
        success: false,
        error: `不支持的文件类型: ${path.extname(filePath)}。支持: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
        errorCategory: "permanent",
      });
    }

    const fullPath = path.join(PROJECT_ROOT, filePath);

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({
        success: false,
        error: `文件不存在: ${filePath}`,
        errorCategory: "permanent",
      });
    }

    const raw = fs.readFileSync(fullPath, "utf-8");

    // Detect encoding corruption before returning
    if (isGarbledText(raw)) {
      return NextResponse.json({
        success: false,
        error: `文件编码异常，无法读取: ${filePath}。建议将文件另存为 UTF-8 编码后重试。`,
        errorCategory: "permanent",
      });
    }

    const truncated = raw.length > MAX_CHARS;
    const content = truncated ? raw.slice(0, MAX_CHARS) : raw;

    return NextResponse.json({
      success: true,
      data: { content, truncated, charCount: raw.length, source: "fs" },
      errorCategory: "ok",
    });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error: `读取失败: ${err instanceof Error ? err.message : "未知错误"}`,
      errorCategory: "permanent",
    });
  }
}
