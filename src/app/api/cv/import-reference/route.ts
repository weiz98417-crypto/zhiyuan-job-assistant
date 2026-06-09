import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { isGarbledText } from "@/lib/agent/loop/text-quality";
import {
  buildReferenceResumeRawText,
  indexReferenceResumeBestEffort,
  looksLikeResumeText,
  normalizeReferenceVisibility,
  normalizeRoleCategory,
  redactReferenceResumeText,
  scoreReferenceResumeQuality,
} from "@/lib/reference-resume-vector";
import { stableHash } from "@/lib/memory/vector-memory";
import { persistExcellentResumePatternsBestEffort } from "@/lib/excellent-resume-patterns";
import { ZHIPU_API_URL, ZHIPU_VISION_MODEL } from "@/lib/zhipu";
import mammoth from "mammoth";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface CVSection {
  id: string;
  title: string;
  content: string;
}

async function parseCVWithAI(rawText: string): Promise<CVSection[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");

  const systemPrompt = `你是一个简历解析专家。将输入的简历文本解析为结构化 sections。
标准 sections: summary（概述/个人总结）、experience（工作经历）、projects（项目经历）、skills（技能）、education（教育背景）。

关键规则：
1. **项目经历提取（最重要）**：工作经历中嵌套的项目描述（通常以"项目名称""项目背景""核心工作""XX项目"等开头），必须完整提取到 projects section。工作经历保留公司、职位、时间、部门等框架信息，具体项目内容移到项目经历。
2. **个人概述**：如果原文没有独立的个人概述段落，从工作经历和技能中提取 1-2 句话总结候选人的核心定位和专业特长。
3. **保留原文**：所有量化数据、专业术语、项目名称必须原样保留，不要改写或总结。
4. **不遗漏**：检查原文每一个段落是否都被归类到了某个 section，不允许丢弃任何内容。
5. 返回纯 JSON，格式：{"sections":[{"id":"summary","title":"个人概述","content":"..."},...]}

title 字段使用中文：个人概述、工作经历、项目经历、技能、教育背景`;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText.slice(0, 16000) },
      ],
      temperature: 0.1,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(`AI API error: ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回为空");

  let parsed: { sections?: CVSection[] } | undefined;
  const strategies = [
    () => JSON.parse(content),
    () => {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      return match ? JSON.parse(match[1]) : null;
    },
    () => {
      const match = content.match(/\{[\s\S]*"sections"[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    },
    () => {
      const match = content.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    },
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && result.sections) {
        parsed = result;
        break;
      }
    } catch {
      // Try the next extraction strategy.
    }
  }

  if (!parsed) throw new Error(`AI 返回格式解析失败。原始返回: ${content.slice(0, 300)}`);
  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error("AI 解析结果缺少 sections 数组");
  }

  return parsed.sections;
}

async function ocrWithZhipu(base64DataUri: string): Promise<string> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error("未配置 ZHIPU_API_KEY，图片/PDF 解析需要智谱 API");

  const response = await fetch(ZHIPU_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ZHIPU_VISION_MODEL,
      messages: [
        {
          role: "system",
          content: "你是一个专业的简历 OCR 识别助手。请完整提取图片中的简历文本内容，保留所有量化数据、项目名称、技术术语，不要做任何改写或总结。直接返回原文。",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: base64DataUri } },
            { type: "text", text: "请完整提取这张简历图片中的所有文字内容，保留原始格式和量化数据。" },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Zhipu OCR error:", response.status, errText);
    throw new Error(`智谱 OCR 失败: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("智谱 OCR 返回为空");
  return text;
}

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";

async function extractViaQwenLong(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("未配置 DASHSCOPE_API_KEY，文件解析需要阿里云百炼 API");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  form.append("purpose", "file-extract");
  const upRes = await fetch(`${DASHSCOPE_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!upRes.ok) throw new Error(`文件上传失败: ${upRes.status}`);
  const { id: fileId } = await upRes.json() as { id: string };

  const chatRes = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "qwen-long",
      messages: [
        { role: "system", content: `fileid://${fileId}` },
        { role: "user", content: "请提取这份PDF文档中的完整文字内容。保留所有量化数据、专业术语。不要总结、不要改写。" },
      ],
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!chatRes.ok) throw new Error(`Qwen-Long 调用失败: ${chatRes.status}`);
  const data = await chatRes.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || "";
}

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const contentType = request.headers.get("content-type") || "";

    let rawText = "";
    let source: "paste" | "upload" = "paste";
    let requestedName = "";
    let requestedRoleCategory = "";
    let requestedVisibility = "private";
    let requestedNotes = "";
    let requestedTags: string[] = [];
    let saveAsExcellent = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "未上传文件" }, { status: 400 });
      }

      const fileName = file.name;
      const ext = getFileExtension(fileName);
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      if (fileBuffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, error: "文件大小不能超过 10MB" }, { status: 400 });
      }

      if (ext === "txt" || ext === "md") {
        rawText = new TextDecoder().decode(fileBuffer);
      } else if (ext === "docx") {
        try {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          rawText = result.value;
          if (!rawText.trim()) {
            return NextResponse.json({ success: false, error: "Word 文档中未提取到文本内容" }, { status: 400 });
          }
          if (isGarbledText(rawText)) {
            console.log("[import-reference] mammoth output appears garbled, falling back to Qwen-Long");
            try {
              const fallbackText = await extractViaQwenLong(fileBuffer, file.name);
              if (fallbackText.trim()) {
                rawText = fallbackText;
              }
            } catch (fallbackErr) {
              console.error("[import-reference] Qwen-Long fallback also failed:", fallbackErr);
            }
            if (isGarbledText(rawText) || !rawText.trim()) {
              return NextResponse.json({
                success: false,
                error: "文档编码不兼容，无法提取文本。请尝试：1)将文档另存为 UTF-8 编码的 .txt 文件后重新上传 2)直接粘贴简历文本内容 3)发送截图",
              }, { status: 400 });
            }
          }
        } catch {
          return NextResponse.json({ success: false, error: "Word 文档解析失败，请确认文件格式为 .docx" }, { status: 400 });
        }
      } else if (ext === "doc") {
        rawText = await extractViaQwenLong(fileBuffer, file.name);
        if (!rawText.trim()) {
          return NextResponse.json({ success: false, error: ".doc 中未提取到文本内容" }, { status: 400 });
        }
      } else if (ext === "pdf") {
        rawText = await extractViaQwenLong(fileBuffer, file.name);
        if (!rawText.trim()) {
          return NextResponse.json({ success: false, error: "PDF 中未提取到文本内容" }, { status: 400 });
        }
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        const base64 = fileBuffer.toString("base64");
        const dataUri = `data:${mimeType};base64,${base64}`;
        try {
          rawText = await ocrWithZhipu(dataUri);
          if (!rawText.trim()) {
            return NextResponse.json({ success: false, error: "图片中未识别到简历文本" }, { status: 400 });
          }
        } catch (ocrErr) {
          const msg = ocrErr instanceof Error ? ocrErr.message : "解析失败";
          return NextResponse.json({ success: false, error: `图片 OCR 失败: ${msg}` }, { status: 400 });
        }
      } else {
        return NextResponse.json({
          success: false,
          error: `不支持的文件格式（${ext}）。支持：.txt / .md / .doc / .docx / .pdf / .png / .jpg / .webp`,
        }, { status: 400 });
      }

      source = "upload";
      requestedName = String(formData.get("name") || "");
      requestedRoleCategory = String(formData.get("roleCategory") || formData.get("role_category") || "");
      requestedVisibility = String(formData.get("visibility") || "private");
      requestedNotes = String(formData.get("notes") || "");
      requestedTags = parseTags(formData.get("tags"));
      saveAsExcellent = String(formData.get("saveAsExcellent") || "").toLowerCase() === "true";
    } else {
      const body = await request.json().catch(() => ({}));
      rawText = (body.text as string) || "";
      if (!rawText.trim()) {
        return NextResponse.json({ success: false, error: "请提供简历文本" }, { status: 400 });
      }
      requestedName = String(body.name || "");
      requestedRoleCategory = String(body.roleCategory || body.role_category || "");
      requestedVisibility = String(body.visibility || "private");
      requestedNotes = String(body.notes || "");
      requestedTags = parseTags(body.tags);
      saveAsExcellent = Boolean(body.saveAsExcellent || body.save_as_excellent);
      source = "paste";
    }

    if (saveAsExcellent && !looksLikeResumeText(rawText)) {
      return NextResponse.json({
        success: false,
        error: "上传内容不像一份完整简历，请确认文件或文本后再保存为优秀参考简历。",
      }, { status: 400 });
    }

    let sections: CVSection[];
    try {
      sections = await parseCVWithAI(rawText);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "解析失败";
      return NextResponse.json({ success: false, error: `AI 解析失败: ${msg}` }, { status: 500 });
    }

    const firstRole = sections.find((section) => section.id === "summary")?.content?.slice(0, 30) || "未命名";
    const defaultName = `参考简历-${firstRole.slice(0, 20).replace(/\n/g, " ")}`;

    const repos = getDataRepositories();
    const baseName = requestedName.trim() || defaultName;
    const exists = await repos.referenceResumes.nameExists(baseName, undefined, user.userId);
    const name = exists ? `${baseName}-${Date.now().toString(36)}` : baseName;

    const rawTextForIndex = buildReferenceResumeRawText(sections, rawText);
    const sourceHash = stableHash(rawTextForIndex);
    const roleCategory = normalizeRoleCategory(requestedRoleCategory, rawTextForIndex);
    const qualityScore = scoreReferenceResumeQuality({ rawText: rawTextForIndex, sections });
    const requestedVisibilityNormalized = normalizeReferenceVisibility(requestedVisibility);
    const redactedText = redactReferenceResumeText(rawTextForIndex);
    const isTeamRequested = requestedVisibilityNormalized === "team";
    const actualVisibility = isTeamRequested && user.role === "admin" && qualityScore >= 0.45
      ? "team"
      : isTeamRequested
        ? "team_pending"
        : requestedVisibilityNormalized;
    const status = actualVisibility === "team_pending" ? "pending" : actualVisibility === "disabled" ? "disabled" : "active";
    const approvedBy = actualVisibility === "team" ? user.userId : null;
    const approvedAt = actualVisibility === "team" ? new Date().toISOString() : null;

    const duplicate = await repos.referenceResumes.findBySourceHash(sourceHash, user.userId);
    if (duplicate) {
      return NextResponse.json({
        success: true,
        data: {
          id: duplicate.id,
          name: duplicate.name,
          source: duplicate.source,
          sections: parseJsonArray<CVSection>(duplicate.sections_json),
          tags: parseJsonArray<string>(duplicate.tags),
          roleCategory: duplicate.role_category || roleCategory,
          visibility: duplicate.visibility || "private",
          status: duplicate.status || "active",
          qualityScore: Number(duplicate.quality_score || 0),
          anonymized: Boolean(duplicate.anonymized),
          duplicate: true,
          indexing: { status: "skipped", chunks: 0, embedded: 0, failed: 0, reason: "Duplicate source hash" },
        },
      });
    }

    const tags: string[] = [];
    const tagPatterns: [RegExp, string][] = [
      [/产品经理/g, "产品经理"],
      [/后端|Java|Go|Python|Node\.js/g, "后端开发"],
      [/前端|React|Vue|TypeScript/g, "前端开发"],
      [/算法|机器学习|深度学习/g, "AI/算法"],
      [/数据|SQL|数据分析/g, "数据"],
      [/设计|Figma|UI|UX/g, "设计"],
      [/运营/g, "运营"],
      [/架构/g, "架构"],
    ];
    const contentText = sections.map((section) => section.content).join(" ");
    for (const [regex, tag] of tagPatterns) {
      if (regex.test(contentText) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
    for (const tag of requestedTags) {
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
    if (roleCategory && roleCategory !== "general" && !tags.includes(roleCategory)) {
      tags.push(roleCategory);
    }

    const id = await repos.referenceResumes.insert({
      name,
      source,
      sections_json: JSON.stringify(sections),
      raw_text: rawTextForIndex,
      tags: JSON.stringify(tags),
      notes: requestedNotes,
      role_category: roleCategory,
      visibility: actualVisibility,
      status,
      quality_score: qualityScore,
      anonymized: actualVisibility !== "private",
      shared_text_redacted: actualVisibility !== "private" ? redactedText : "",
      source_hash: sourceHash,
      metadata_json: JSON.stringify({
        saveAsExcellent,
        requestedVisibility: requestedVisibilityNormalized,
        roleCategory,
        qualityScore,
      }),
      approved_by: approvedBy,
      approved_at: approvedAt,
    }, user.userId);

    const indexing = await indexReferenceResumeBestEffort({
      referenceResumeId: id,
      ownerUserId: user.userId,
      name,
      sections,
      rawText: actualVisibility === "private" ? rawTextForIndex : redactedText,
      roleCategory,
      visibility: actualVisibility,
      status,
      qualityScore,
    });
    const patternMemory = await persistExcellentResumePatternsBestEffort({
      userId: user.userId,
      referenceResumeId: id,
      sections,
      rawText: actualVisibility === "private" ? rawTextForIndex : redactedText,
      roleCategory,
      visibility: actualVisibility,
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        name,
        source,
        sections,
        tags,
        roleCategory,
        visibility: actualVisibility,
        status,
        qualityScore,
        anonymized: actualVisibility !== "private",
        indexing,
        patternMemory,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Import reference resume error:", message);
    return NextResponse.json(
      { success: false, error: `导入失败: ${message}` },
      { status: 500 },
    );
  }
}

function parseTags(value: FormDataEntryValue | unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).map((tag) => tag.trim()).filter(Boolean);
    } catch {
      return value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseJsonArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}
