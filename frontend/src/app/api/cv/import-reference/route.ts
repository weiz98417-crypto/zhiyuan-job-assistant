import { NextResponse } from "next/server";
import { insertReferenceResume, checkReferenceResumeName } from "@/lib/server-db";
import mammoth from "mammoth";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL = "deepseek-v4-flash";
const ZHIPU_MODEL = "glm-4.6v-flashx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

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

规则：
1. 按原文内容归类到对应 section
2. 保留原文措辞和量化数据，不要改写
3. 如果原文没有某个 section，该 section 置空字符串
4. 返回纯 JSON，格式：{"sections":[{"id":"summary","title":"个人概述","content":"..."},...]}

title 字段使用中文：个人概述、工作经历、项目经历、技能、教育背景`;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText.slice(0, 8000) },
      ],
      temperature: 0.1,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(`AI API error: ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回为空");

  let parsed: { sections?: CVSection[] };
  // Try multiple extraction strategies
  const strategies = [
    () => JSON.parse(content),
    () => { const m = content.match(/```(?:json)?\s*([\s\S]*?)```/); return m ? JSON.parse(m[1]) : null; },
    () => { const m = content.match(/\{[\s\S]*"sections"[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
    () => { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
  ];
  for (const strat of strategies) {
    try {
      const result = strat();
      if (result && result.sections) { parsed = result; break; }
    } catch { /* next strategy */ }
  }
  if (!parsed!) throw new Error(`AI 返回格式解析失败。原始返回: ${content.slice(0, 300)}`);

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
      model: ZHIPU_MODEL,
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

  // Upload
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  form.append("purpose", "file-extract");
  const upRes = await fetch(`${DASHSCOPE_BASE}/files`, {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!upRes.ok) throw new Error(`文件上传失败: ${upRes.status}`);
  const { id: fileId } = await upRes.json() as { id: string };

  // Parse via Qwen-Long
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
    const contentType = request.headers.get("content-type") || "";

    let rawText = "";
    let source: "paste" | "upload" = "paste";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "未上传文件" }, { status: 400 });
      }

      const fileName = file.name;
      const ext = getFileExtension(fileName);
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      // Check file size
      if (fileBuffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, error: "文件大小不能超过 10MB" }, { status: 400 });
      }

      // Parse different file formats
      if (ext === "txt" || ext === "md") {
        rawText = new TextDecoder().decode(fileBuffer);
      } else if (ext === "docx") {
        try {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          rawText = result.value;
          if (!rawText.trim()) {
            return NextResponse.json({ success: false, error: "Word 文档中未提取到文本内容" }, { status: 400 });
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
    } else {
      // JSON body: text paste
      const body = await request.json().catch(() => ({}));
      rawText = (body.text as string) || "";
      if (!rawText.trim()) {
        return NextResponse.json({ success: false, error: "请提供简历文本" }, { status: 400 });
      }
      source = "paste";
    }

    // Parse with AI (DeepSeek)
    let sections: CVSection[];
    try {
      sections = await parseCVWithAI(rawText);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "解析失败";
      return NextResponse.json({ success: false, error: `AI 解析失败: ${msg}` }, { status: 500 });
    }

    // Generate default name from content
    const firstRole = sections.find(s => s.id === "summary")?.content?.slice(0, 30) || "未命名";
    const defaultName = `参考简历-${firstRole.slice(0, 20).replace(/\n/g, " ")}`;

    // Check duplicate
    const exists = checkReferenceResumeName(defaultName);
    const name = exists ? `${defaultName}-${Date.now().toString(36)}` : defaultName;

    // Build raw_text for FTS5 index
    const rawTextForIndex = sections
      .filter(s => s.content?.trim())
      .map(s => `【${s.title}】\n${s.content}`)
      .join("\n\n");

    // Auto-extract tags from content
    const tags: string[] = [];
    const tagPatterns: [RegExp, string][] = [
      [/产品经理/g, "产品经理"], [/后端|Java|Go|Python|Node\.js/g, "后端开发"],
      [/前端|React|Vue|TypeScript/g, "前端开发"], [/算法|机器学习|深度学习/g, "AI/算法"],
      [/数据|SQL|数据分析/g, "数据"], [/设计|Figma|UI|UX/g, "设计"],
      [/运营/g, "运营"], [/架构/g, "架构"],
    ];
    const contentLower = sections.map(s => s.content).join(" ");
    for (const [regex, tag] of tagPatterns) {
      if (regex.test(contentLower) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    const id = insertReferenceResume({
      name,
      source,
      sections_json: JSON.stringify(sections),
      raw_text: rawTextForIndex,
      tags: JSON.stringify(tags),
    });

    return NextResponse.json({
      success: true,
      data: { id, name, source, sections, tags },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Import reference resume error:", message);
    return NextResponse.json(
      { success: false, error: `导入失败: ${message}` },
      { status: 500 },
    );
  }
}
