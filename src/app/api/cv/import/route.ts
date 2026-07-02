import { NextResponse } from "next/server";
import {
  DocumentExtractionError,
  extractResumeDocument,
  type DocumentExtractionDiagnostics,
} from "@/lib/server/document-extraction";
import { ZHIPU_API_URL, ZHIPU_VISION_MODEL } from "@/lib/zhipu";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const RESUME_PARSE_MODEL = process.env.DEEPSEEK_RESUME_PARSE_MODEL || "deepseek-v4-flash";

type ResumeSectionId = "summary" | "experience" | "projects" | "skills" | "education";
type ResumeSections = Record<ResumeSectionId, string>;

// ── Helpers ──

function fmtField(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item) {
        const obj = item as Record<string, unknown>;
        const lines: string[] = [];
        // Header line: company / position / time
        const header: string[] = [];
        if (obj.company) header.push(obj.company as string);
        if (obj.position) header.push(obj.position as string);
        if (obj.time || obj.duration) header.push((obj.time || obj.duration) as string);
        if (obj.name) { header.push(obj.name as string); if (obj.role) header.push(obj.role as string); }
        if (header.length) lines.push(header.join(" — "));
        // Background / description
        if (obj.background) lines.push(obj.background as string);
        // Responsibilities as bullet points
        const resp = obj.responsibilities;
        if (Array.isArray(resp)) {
          lines.push(resp.map((r: string) => `• ${r}`).join("\n"));
        } else if (typeof resp === "string" && resp) {
          lines.push(resp);
        }
        // Results
        if (obj.results) lines.push(`成果：${obj.results}`);
        // Any remaining string fields
        Object.entries(obj).forEach(([k, val]) => {
          if (!["company","position","time","duration","name","role","background","responsibilities","results"].includes(k)) {
            if (typeof val === "string" && val) lines.push(val);
          }
        });
        return lines.join("\n");
      }
      return String(item);
    }).join("\n\n");
  }
  return String(v);
}

function normalizeResumeSections(input: Record<string, string>): ResumeSections {
  const sections: ResumeSections = {
    summary: cleanSection(input.summary),
    experience: cleanSection(input.experience),
    projects: cleanSection(input.projects),
    skills: cleanSection(input.skills),
    education: cleanSection(input.education),
  };

  const split = splitEmbeddedProjectsFromExperience(sections.experience);
  if (split.projects) {
    sections.experience = split.experience;
    sections.projects = appendSection(sections.projects, split.projects);
  }

  return sections;
}

function cleanSection(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function appendSection(existing: string, addition: string): string {
  const cleanExisting = cleanSection(existing);
  const cleanAddition = cleanSection(addition);
  if (!cleanAddition) return cleanExisting;
  if (!cleanExisting) return cleanAddition;
  if (cleanExisting.includes(cleanAddition)) return cleanExisting;
  return `${cleanExisting}\n\n${cleanAddition}`;
}

function splitEmbeddedProjectsFromExperience(experience: string): { experience: string; projects: string } {
  const text = cleanSection(experience);
  if (!text) return { experience: "", projects: "" };

  const lines = text.split("\n");
  const projectStartIndex = lines.findIndex((line) => isProjectSectionStart(line));
  if (projectStartIndex < 0) return { experience: text, projects: "" };

  return {
    experience: cleanSection(lines.slice(0, projectStartIndex).join("\n")),
    projects: cleanSection(lines.slice(projectStartIndex).join("\n")),
  };
}

function isProjectSectionStart(line: string): boolean {
  const text = line.trim().replace(/^[-•\d.、\s]+/, "");
  if (!text) return false;
  if (/^(项目经历|项目经验|项目实践|代表项目|主要项目|项目案例|Projects?)\s*[:：]?\s*$/i.test(text)) return true;
  return /^(项目经历|项目经验|项目实践|代表项目|主要项目|项目名称|项目背景|项目描述|项目职责|核心工作|项目成果|项目业绩|项目内容|项目亮点)\s*[:：]/i.test(text);
}

function parseJsonObject(content: string): Record<string, unknown> {
  const clean = content.trim().replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "");
  const strategies = [
    () => JSON.parse(clean),
    () => {
      const match = clean.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    },
  ];

  for (const strategy of strategies) {
    try {
      const parsed = strategy();
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Try the next extraction strategy.
    }
  }

  throw new Error("No JSON found");
}

// ── Zhipu vision multimodal → direct JSON (images) ──

async function parseViaZhipu(dataUri: string): Promise<Record<string, string>> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error("未配置 ZHIPU_API_KEY");
  const res = await fetch(ZHIPU_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: ZHIPU_VISION_MODEL,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: dataUri } },
        { type: "text", text: `阅读这份简历图片，理解内容后按栏目归类提取JSON。每个栏目保留原文完整内容：

- summary: 个人信息（姓名、联系方式、求职意向）和一句话职业定位
- experience: 工作经历。公司、职位、时间、工作内容完整保留
- projects: 项目经验。背景、职责、成果完整保留
- skills: 专业技能（技术栈、工具、语言），逗号分隔
- education: 教育背景（学校、专业、学历、时间）

规则：先理解再归类；信息归对栏目（个人信息→summary，技术→skills）；保留原文措辞不压缩。缺失返回""。直接JSON。` },
      ]}],
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`智谱识别失败: ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || "";
  try {
    let clean = text.trim();
    clean = clean.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "");
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const json = JSON.parse(jsonMatch[0]);
    return normalizeResumeSections({
      summary: fmtField(json.summary) || fmtField(json.personal_info) || "",
      experience: fmtField(json.experience) || fmtField(json.work_experience) || "",
      projects: fmtField(json.projects) || fmtField(json.project_experience) || "",
      skills: fmtField(json.skills) || "",
      education: fmtField(json.education) || "",
    });
  } catch { return { summary: text, experience: "", projects: "", skills: "", education: "" }; }
}

// ── DeepSeek parse (Word / Text only) ──

async function parseViaDeepSeek(rawText: string): Promise<Record<string, string>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: RESUME_PARSE_MODEL,
      messages: [
        { role: "system", content: `你是精确的简历文本重新分栏器。把原文段落按栏目归类，直接复制原文，不增不减不改。

输出JSON：{"personal":"","summary":"","experience":"","projects":"","skills":"","education":""}

归类规则：
- personal: 姓名、电话、邮箱、城市
- summary: 个人总结段落（如"本人具有X年经验，擅长..."）
- experience: 工作经历，只保留公司、职位、时间段、部门、职责概述、业务范围等任职信息
- projects: 项目经历/项目经验，必须保留项目名称、项目背景、目标、角色、核心工作、技术/产品方案、成果数据
- skills: 技能列表（编程语言、工具、证书等）
- education: 学校、专业、学历、毕业时间

项目拆分硬规则：
- 即使项目写在某一段工作经历下面，只要出现"项目经历""项目经验""项目名称""项目背景""项目职责""核心工作""项目成果""XX项目"等项目块，也必须完整放入projects。
- 如果项目隶属于某家公司，projects里保留公司/岗位/时间上下文，experience里只保留任职框架和非项目型职责。
- 禁止把具体项目块整段放在experience里。
- 如果没有独立项目标题，但某段明显围绕一个系统/平台/助手/工具/模型/Agent/App/小程序从背景、工作、结果展开，也归projects。

❌ 反例（绝对禁止）：
- summary里不要放学校、专业、学历 → 这些归education
- summary里不要放Python、React等技能词 → 这些归skills
- experience里不要把时间和岗位描述拆散 → 同一段经历的完整原文放一起
- experience里不要包含"项目名称/项目背景/核心工作/项目成果"这类项目块 → 这些归projects
- 不要自己总结"毕业于XX大学" → 照抄原文

自检后再输出JSON：检查experience中是否还有项目块；如果有，先迁移到projects再输出。复制原文完整段落，禁止压缩成一句。原文没有的填空字符串""。` },
        { role: "user", content: rawText.slice(0, 16000) },
      ],
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`DeepSeek 解析失败: ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonObject(content);
  const personal = fmtField(parsed.personal);
  const summary = fmtField(parsed.summary);
  return normalizeResumeSections({
    summary: [personal, summary].filter(Boolean).join("\n\n"),
    experience: fmtField(parsed.experience),
    projects: fmtField(parsed.projects),
    skills: fmtField(parsed.skills),
    education: fmtField(parsed.education),
  });
}

// ── Route ──

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let sections: Record<string, string>;
    let extractionDiagnostics: DocumentExtractionDiagnostics | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ success: false, error: "未上传文件" }, { status: 400 });

      const ext = getExt(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, error: "文件大小不能超过 10MB" }, { status: 400 });
      }

      if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) {
        const extraction = await extractResumeDocument({ buffer, filename: file.name, ext });
        extractionDiagnostics = extraction.diagnostics;
        sections = await parseViaDeepSeek(extraction.text);
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        // Image → Zhipu vision model → direct JSON
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
        sections = await parseViaZhipu(dataUri);
      } else {
        return NextResponse.json({
          success: false,
          error: `不支持的文件格式（${ext}）。支持：pdf / png / jpg / webp / doc / docx / txt / md`,
        }, { status: 400 });
      }
    } else if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const rawText = (body.text as string) || "";
      if (!rawText.trim()) return NextResponse.json({ success: false, error: "请提供简历文本" }, { status: 400 });
      sections = await parseViaDeepSeek(rawText);
    } else {
      return NextResponse.json({ success: false, error: "请上传文件或粘贴简历文本" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { sections, extraction: extractionDiagnostics } });
  } catch (err) {
    console.error("CV import error:", err);
    if (err instanceof DocumentExtractionError) {
      return NextResponse.json(
        {
          success: false,
          code: err.code,
          error: err.userMessage,
          diagnostics: err.diagnostics,
        },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "导入失败" },
      { status: 500 },
    );
  }
}
