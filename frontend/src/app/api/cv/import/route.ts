import { NextResponse } from "next/server";

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

// ── Zhipu glm-4.6v-flashx multimodal → direct JSON (images) ──

async function parseViaZhipu(dataUri: string): Promise<Record<string, string>> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error("未配置 ZHIPU_API_KEY");
  const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "glm-4.6v-flashx",
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
    return {
      summary: fmtField(json.summary) || fmtField(json.personal_info) || "",
      experience: fmtField(json.experience) || fmtField(json.work_experience) || "",
      projects: fmtField(json.projects) || fmtField(json.project_experience) || "",
      skills: fmtField(json.skills) || "",
      education: fmtField(json.education) || "",
    };
  } catch { return { summary: text, experience: "", projects: "", skills: "", education: "" }; }
}

// ── Split embedded projects from work experience ──

function splitWorkAndProject(exp: string): { work: string; projects: string } {
  // Split by "项目名称：" markers
  const parts = exp.split(/\n(?=项目名称[：:])/);
  // parts[0] = first company info (work), parts[1..n] = project blocks

  const work: string[] = [parts[0].trim()];
  const proj: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    let block = parts[i];
    // Try to find trailing company header (3-4 lines at end: company, position, date)
    const lines = block.split("\n");
    // Look for date pattern in last few lines
    let splitAt = lines.length;
    for (let j = lines.length - 1; j >= Math.max(0, lines.length - 5); j--) {
      if (/\d{4}[\.-]\d{2}\s*[-–—]\s*(\d{4}[\.-]\d{2}|至今|现在)/.test(lines[j])) {
        // Found date line — company header is lines j-2 to j
        splitAt = Math.max(0, j - 2);
        break;
      }
    }
    if (splitAt < lines.length - 1) {
      proj.push(lines.slice(0, splitAt).join("\n").trim());
      work.push(lines.slice(splitAt).join("\n").trim());
    } else {
      // No trailing company — whole block is project (last one)
      proj.push(block.trim());
    }
  }

  return {
    work: work.join("\n\n").replace(/\n{3,}/g, "\n\n"),
    projects: proj.join("\n\n"),
  };
}

// ── Qwen-Long: file upload → direct structured JSON ──

async function parseViaQwenLong(buffer: Buffer, mimeType: string, filename: string): Promise<Record<string, string>> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("未配置 DASHSCOPE_API_KEY");

  // 1. Upload
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("purpose", "file-extract");
  const upRes = await fetch(`${DASHSCOPE_BASE}/files`, {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!upRes.ok) throw new Error(`文件上传失败: ${upRes.status}`);
  const { id: fileId } = await upRes.json() as { id: string };

  // 2. Parse
  const chatRes = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "qwen-long",
      messages: [
        { role: "system", content: `fileid://${fileId}` },
        { role: "user", content: `请把这份PDF简历的内容完整提取出来。输出格式要求：用 ===SECTION=== 作为每个栏目的分隔标记。严格按照以下6个标记输出，标记必须一模一样：

===个人信息===
（姓名、电话、邮箱等）
===个人概述===
（自我评价、求职目标段落）
===工作经历===
（每段工作原文）
===项目经验===
（每个项目原文）
===技能===
（技能列表原文）
===教育背景===
（学历信息原文）

重要：1）标记必须原样输出 2）内容原样复制 3）栏目为空的写"无" 4）不要在标记前后加任何其他文字` },
      ],
      max_tokens: 16000,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!chatRes.ok) throw new Error(`Qwen-Long 调用失败: ${chatRes.status}`);
  const data = await chatRes.json() as { choices?: { message?: { content?: string } }[] };
  const rawText = data.choices?.[0]?.message?.content || "";
  if (!rawText) throw new Error("Qwen-Long 返回为空");

  // Parse ===SECTION=== markers into CV fields
  const cleaned = rawText
    .replace(/[0-9a-fA-F]{30,}/g, "")
    .replace(/([0-9a-fA-F]{2}\s?){10,}/g, "")
    .trim();

  const extract = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`===${escaped}===\\s*\\n([\\s\\S]*?)(?=\\n===|$)`, "i");
    const m = cleaned.match(re);
    const val = m?.[1]?.trim() || "";
    return val === "无" ? "" : val;
  };

  const personal = extract("个人信息");
  const overview = extract("个人概述");
  const work = extract("工作经历");
  const proj = extract("项目经验");
  const skill = extract("技能");
  const edu = extract("教育背景");

  // Post-process 1: extract project blocks from work experience
  let exp = work;
  let prj = proj;
  if (!prj && exp && /项目名称[：:]/.test(exp)) {
    const r = splitWorkAndProject(exp);
    exp = r.work;
    prj = r.projects;
  }

  // Post-process 2: extract education from summary/overview
  let sum = [personal, overview].filter(Boolean).join("\n\n");
  let edu2 = edu;
  const eduPattern = /(?:大学|学院|本科|硕士|博士|学士|研究生|毕业|专业[：:]|学历[：:]|学位[：:]|学校[：:]|教育背景)/;
  const eduLinePattern = /^.*(?:大学|学院|本科|硕士|博士|学士|专业[：:]|学历[：:]|学位[：:]|学校[：:]|教育背景).*$/gm;
  if (!edu2 && eduPattern.test(sum)) {
    const eduLines: string[] = [];
    sum = sum.replace(eduLinePattern, (m) => {
      eduLines.push(m);
      return "";
    });
    sum = sum.replace(/\n{3,}/g, "\n\n").trim();
    edu2 = eduLines.join("\n");
  }

  return {
    summary: sum,
    experience: exp,
    projects: prj,
    skills: skill,
    education: edu2,
  };
}

// ── DeepSeek parse (Word / Text only) ──

async function parseViaDeepSeek(rawText: string): Promise<Record<string, string>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: `你是精确的简历文本归类器。把原文段落按栏目归类，直接复制原文，不增不减不改。

输出JSON：{"personal":"","summary":"","experience":"","projects":"","skills":"","education":""}

归类规则：
- personal: 姓名、电话、邮箱、城市
- summary: 个人总结段落（如"本人具有X年经验，擅长..."）
- experience: 工作经历（含公司名、职位、时间段、工作内容描述）
- projects: 项目经验（含项目名称、角色、成果数据）
- skills: 技能列表（编程语言、工具、证书等）
- education: 学校、专业、学历、毕业时间

❌ 反例（绝对禁止）：
- summary里不要放学校、专业、学历 → 这些归education
- summary里不要放Python、React等技能词 → 这些归skills
- experience里不要把时间和岗位描述拆散 → 同一段经历的完整原文放一起
- 不要自己总结"毕业于XX大学" → 照抄原文

复制原文完整段落，禁止压缩成一句。原文没有的填空字符串""。` },
        { role: "user", content: rawText.slice(0, 12000) },
      ],
      temperature: 0, max_tokens: 8000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`DeepSeek 解析失败: ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(content.replace(/```json\s*|```\s*/g, "").trim());
  const personal = fmtField(parsed.personal);
  const summary = fmtField(parsed.summary);
  return {
    summary: [personal, summary].filter(Boolean).join("\n\n"),
    experience: fmtField(parsed.experience),
    projects: fmtField(parsed.projects),
    skills: fmtField(parsed.skills),
    education: fmtField(parsed.education),
  };
}

// ── Route ──

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let sections: Record<string, string>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ success: false, error: "未上传文件" }, { status: 400 });

      const ext = getExt(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, error: "文件大小不能超过 10MB" }, { status: 400 });
      }

      if (ext === "pdf") {
        // PDF → Qwen-Long (dedicated document channel)
        sections = await parseViaQwenLong(buffer, "application/pdf", file.name);
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        // Image → Zhipu glm-4.6v-flashx → direct JSON
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
        sections = await parseViaZhipu(dataUri);
      } else if (ext === "docx") {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        if (!result.value.trim()) {
          return NextResponse.json({ success: false, error: "Word 文档中未提取到文本内容" }, { status: 400 });
        }
        sections = await parseViaDeepSeek(result.value);
      } else if (ext === "doc") {
        // Legacy .doc → Qwen-Long file upload (same as PDF)
        sections = await parseViaQwenLong(buffer, "application/msword", file.name);
      } else if (ext === "txt" || ext === "md") {
        const rawText = new TextDecoder().decode(buffer);
        sections = await parseViaDeepSeek(rawText);
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

    return NextResponse.json({ success: true, data: { sections } });
  } catch (err) {
    console.error("CV import error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "导入失败" },
      { status: 500 },
    );
  }
}
