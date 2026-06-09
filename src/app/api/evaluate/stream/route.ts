/* ── SSE Streaming JD Evaluation API ── */

import fs from "fs";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { ZHIPU_API_URL, ZHIPU_VISION_MODEL } from "@/lib/zhipu";
import { buildOCRImageCandidates, normalizeImageDataUri } from "@/lib/server-image-variants";

import { llmRetry, LLMError } from "@/lib/llm-retry";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const MAX_IMAGES = 5;

const OCR_SYSTEM_PROMPT = `你是一个专业的招聘 JD 图片识别助手。用户上传一张图片（可能是职位描述截图），你需要提取其中的结构化信息。

## 提取规则
1. 如果图片包含职位描述（JD），提取 company、role、body、skills、isJD
2. 如果图片不包含 JD，返回 { "isJD": false, "reason": "说明原因" }
3. 无法从图片中识别到的字段，填写空字符串
4. skills 字段返回数组，如 ["React", "TypeScript", "Node.js"]
5. body 字段返回完整的 JD 正文原文，保留换行和段落结构

只返回 JSON，不要输出解释。`;

/* ── Types ── */

interface EvalInput { jdText?: string; jdUrl?: string; images?: string[]; cvText?: string; targetCompany?: string; allowWebSearch?: boolean; language?: "zh" | "en"; memoryContext?: string; }
interface BlockResult { content: string; score: number; }
interface RiskSignal { signal: string; excerpt?: string; severity: string; source?: string; }
interface EvalState {
  jdText: string;
  company: string;
  role: string;
  archetype: string;
  language: "zh" | "en";
  blocks: Record<string, BlockResult>;
  overallScore: number;
  reportNum: number;
  searchInfo: string;
  riskSignals: RiskSignal[];
  error?: string;
}

interface OCRPayload {
  company?: string;
  role?: string;
  body?: string;
  skills?: unknown;
  isJD?: boolean;
  reason?: string;
}

interface OCRSingleResult {
  company: string;
  role: string;
  body: string;
  skills: string[];
  isJD: boolean;
  error?: string;
}

/* ── SSE helpers ── */

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function emit(controller: ReadableStreamDefaultController<Uint8Array>, event: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(sse(event)));
}

/* ── Modes loader ── */

function loadModes(language: "zh" | "en"): { shared: string; eval: string; profile: string } {
  const modesDir = path.join(process.cwd(), "modes", language === "zh" ? "zh" : "");
  const read = (f: string) => fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : "";

  const sharedDir = path.join(process.cwd(), "modes", language === "zh" ? "zh" : "");
  return {
    shared: read(path.join(sharedDir, "_shared.md")),
    eval: read(path.join(modesDir, language === "zh" ? "jianzhi.md" : "oferta.md")),
    profile: read(path.join(sharedDir, "_profile.md")),
  };
}

function blockRules(evalMd: string, blockKey: string): string {
  const markers: Record<string, [string, string]> = {
    a: ["## A板块", "## B板块"],
    b: ["## B板块", "## C板块"],
    c: ["## C板块", "## D板块"],
    d: ["## D板块", "## E板块"],
    e: ["## E板块", "## F板块"],
    f: ["## F板块", "## G板块"],
    g: ["## G板块", "## 评估后流程"],
  };
  const [start, end] = markers[blockKey] || ["", ""];
  if (!start || !evalMd.includes(start)) return evalMd;
  const from = evalMd.indexOf(start);
  const to = end && evalMd.indexOf(end, from + start.length) > 0
    ? evalMd.indexOf(end, from + start.length)
    : evalMd.length;
  return evalMd.slice(from, to).trim();
}

/* ── DeepSeek streaming call ── */

async function streamLLM(
  systemPrompt: string,
  userMessage: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal?: AbortSignal,
  blockKey?: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const res = await llmRetry(DEEPSEEK_API_URL, apiKey, {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: blockKey === "f" ? 8000 : blockKey === "a" || blockKey === "b" ? 4000 : 3000,
    stream: true,
    retries: 1,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
  }

  // ── Non-streaming fallback: llmRetry downgraded to stream:false ──
  const isStreaming = (res.headers.get("content-type") || "").includes("text/event-stream");
  if (!isStreaming) {
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || "";
    if (content && blockKey) {
      emit(controller, { type: "block_chunk", block: blockKey, content });
    }
    return content;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let lineBuf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuf += decoder.decode(value, { stream: true });
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            if (blockKey) {
              emit(controller, { type: "block_chunk", block: blockKey, content });
            }
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/* ── Non-streaming LLM for short responses ── */

async function quickLLM(systemPrompt: string, userMessage: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const res = await llmRetry(DEEPSEEK_API_URL, apiKey, {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 500,
    retries: 1,
    timeout: 15_000,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
  });

  if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/* ── OCR: Zhipu GLM-4V ── */

function assessJDText(body: string): { ok: boolean; reason?: string } {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "未识别到正文" };
  if (/达到处理上限|重新提问|上传了\s*JD\s*截图|马上帮你评估|我来看看这份\s*JD|评估过程遇到/i.test(text)) {
    return { ok: false, reason: "识别到的是聊天气泡/系统提示，不是 JD 正文" };
  }

  const keywordHits = [
    /岗位|职位|职责|任职|要求|工作内容|薪资|经验|加分|团队|招聘/,
    /responsibilit|requirement|qualification|salary|position|job|experience|candidate/i,
  ].filter((pattern) => pattern.test(text)).length;

  if (text.length >= 120 && keywordHits > 0) return { ok: true };
  if (text.length >= 260) return { ok: true };
  return { ok: false, reason: "识别文本过短或不像 JD 正文" };
}

async function ocrSingleCandidate(
  base64: string,
  signal?: AbortSignal,
  label = "图片",
): Promise<OCRSingleResult> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) return { company: "", role: "", body: "", skills: [], isJD: true, error: "ZHIPU_API_KEY not configured" };
  const normalized = normalizeImageDataUri(base64);
  if (!normalized) {
    return { company: "", role: "", body: "", skills: [], isJD: true, error: `${label}: 图片数据不是有效 PNG/JPEG/WebP` };
  }

  try {
    const res = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ZHIPU_VISION_MODEL,
        messages: [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: normalized.dataUri } },
              { type: "text", text: "请识别这张图片中的职位描述信息，提取结构化字段。如果这不是 JD 图片请明确说明。" },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Zhipu OCR API error:", res.status, errText.slice(0, 500));
      return {
        company: "",
        role: "",
        body: "",
        skills: [],
        isJD: true,
        error: `OCR API ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ""}`,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { company: "", role: "", body: "", skills: [], isJD: true, error: "Empty OCR response" };

    const parsed = parseOCRPayload(content);
    if (!parsed) {
      return { company: "", role: "", body: "", skills: [], isJD: true, error: "OCR 返回格式解析失败" };
    }
    return {
      company: parsed.company || "",
      role: parsed.role || "",
      body: cleanOCRBody(parsed.body || ""),
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      isJD: parsed.isJD !== false,
      error: parsed.isJD === false ? parsed.reason || "图片不像 JD" : undefined,
    };
  } catch (err) {
    return { company: "", role: "", body: "", skills: [], isJD: true, error: `OCR failed: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

async function ocrSingle(
  base64: string,
  signal?: AbortSignal,
): Promise<OCRSingleResult> {
  let candidates = [{ label: "原图", dataUri: base64 }];
  try {
    candidates = await buildOCRImageCandidates(base64);
  } catch (err) {
    console.warn("OCR candidate build failed:", err instanceof Error ? err.message : String(err));
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    const result = await ocrSingleCandidate(candidate.dataUri, signal, candidate.label);
    if (result.error && !result.body) {
      failures.push(`${candidate.label}: ${result.error}`);
      continue;
    }
    const quality = assessJDText(result.body);
    if (result.isJD && quality.ok) return result;
    failures.push(`${candidate.label}: ${result.error || quality.reason || "未识别到有效 JD"}`);
  }

  return {
    company: "",
    role: "",
    body: "",
    skills: [],
    isJD: true,
    error: failures.slice(0, 3).join("；") || "未能从截图中识别到有效 JD 正文",
  };
}

function parseOCRPayload(content: string): OCRPayload | null {
  const candidates = [
    content.trim(),
    content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim(),
    content.match(/\{[\s\S]*\}/)?.[0]?.trim(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as OCRPayload;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function cleanOCRBody(body: string): string {
  const cleaned = body.replace(/【缺失】/g, "").trim();
  return cleaned.length >= 20 ? cleaned : "";
}

/* ── Score extraction ── */

function extractScore(text: string, blockKey: string): number {
  if (blockKey === "g") {
    // Block G: 0 = no content, 1 = concerns found (the norm for legitimacy checks)
    return text.trim().length > 20 ? 1 : 0;
  }
  // Prefer explicit score markers, then fall back to /5 pattern
  const scoreMatch = text.match(/[总平]分[：:]\s*([\d.]+)/)
    || text.match(/(?<!\d)(\d+\.?\d*)\s*\/\s*5(?!\d)/);
  if (scoreMatch) {
    const s = parseFloat(scoreMatch[1]);
    if (s >= 1 && s <= 5) return Math.round(s * 10) / 10;
  }
  // If LLM explicitly says no data / can't evaluate, score low
  if (/零(薪资|信息|数据)|无.*(信息|数据)|无法评估|不.*可.*(用|得)|缺失|cannot/i.test(text)) {
    return 1;
  }
  return 3;
}

/* ══════════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json()) as EvalInput;
  const { jdText: inputText, jdUrl, images, cvText, targetCompany, allowWebSearch = false, language = "zh", memoryContext = "" } = body;

  // Priority: images > jdUrl > jdText
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasUrl = typeof jdUrl === "string" && /^https?:\/\//.test(jdUrl.trim());
  const hasText = typeof inputText === "string" && inputText.trim().length >= 50;

  if (!hasImages && !hasUrl && !hasText) {
    return new Response(JSON.stringify({ success: false, error: "请提供 JD 文本、链接或截图" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const signal = request.signal;
      const state: EvalState = {
        jdText: "", company: targetCompany?.trim() || "", role: "", archetype: "", language,
        blocks: {} as Record<string, BlockResult>,
        overallScore: 0, reportNum: 0, searchInfo: "", riskSignals: [],
      };

      try {
        /* ── Phase 0: JD Extraction ── */

        if (hasImages) {
          const total = Math.min(images!.length, MAX_IMAGES);
          emit(controller, { type: "phase", phase: "extracting_ocr", source: "ocr", total });

          const bodies: string[] = [];
          const allSkills: string[] = [];
          const ocrErrors: string[] = [];

          for (let i = 0; i < total; i++) {
            if (signal?.aborted) { controller.close(); return; }

            const result = await ocrSingle(images![i], signal);
            let partialText = "";

            if (result.error) ocrErrors.push(`第 ${i + 1} 张：${result.error}`);

            if (result.body && result.isJD) {
              if (result.body) bodies.push(result.body);
              if (result.company && !state.company) state.company = result.company;
              if (result.role && !state.role) state.role = result.role;
              allSkills.push(...result.skills);
              partialText = result.body.slice(0, 200) + (result.body.length > 200 ? "..." : "");
            }

            emit(controller, {
              type: "ocr_progress", current: i + 1, total,
              partialText,
              error: result.error,
              notJD: !result.isJD,
            });
          }

          state.jdText = bodies.join("\n\n---\n\n");
          if (!state.jdText.trim()) {
            const error = ocrErrors.length > 0
              ? `未能从截图中提取到有效 JD 文本（${ocrErrors.slice(0, 2).join("；")}）。请换一张更清晰的原始 JD 截图，或粘贴文本/链接。`
              : "未能从截图中提取到有效 JD 文本，请尝试粘贴文本或链接";
            state.error = error;
            emit(controller, { type: "error", message: error });
            emit(controller, { type: "done" });
            controller.close();
            return;
          }

          emit(controller, { type: "phase", phase: "jd_extracted", source: "ocr", company: state.company, role: state.role });
        } else if (hasUrl) {
          emit(controller, { type: "phase", phase: "extracting_jd", source: "url" });

          try {
            const cheerio = await import("cheerio");
            const fetchRes = await fetch(jdUrl!.trim(), { signal });
            if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
            const html = await fetchRes.text();
            const $ = cheerio.load(html);
            $("script, style, nav, footer, header").remove();
            const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 15000);
            state.jdText = `URL: ${jdUrl}\n\n${text}`;
          } catch (err) {
            const error = `URL 抓取失败: ${err instanceof Error ? err.message : "unknown"}。请尝试粘贴文本`;
            state.error = error;
            emit(controller, { type: "error", message: error });
            emit(controller, { type: "done" });
            controller.close();
            return;
          }

          emit(controller, { type: "phase", phase: "jd_extracted", source: "url" });
        } else {
          state.jdText = inputText!;
          emit(controller, { type: "phase", phase: "jd_extracted", source: "text" });
        }

        if (signal?.aborted) { controller.close(); return; }

        /* ── Load modes ── */
        const modes = loadModes(language);

        /* ── Phase 0.5: Archetype Detection ── */
        emit(controller, { type: "phase", phase: "detecting_archetype", label: "正在分析职位类型..." });

        const archetypeSystem = `${modes.shared}\n\n基于以上规则，分析以下JD的archetype类型。只返回JSON: {"archetype":"类型名","domain":"领域","confidence":"high/medium"}`;

        try {
          const archetypeText = await quickLLM(archetypeSystem, `请分析以下JD的archetype:\n\n${state.jdText.slice(0, 3000)}`, signal);
          const archMatch = archetypeText.match(/\{[\s\S]*\}/);
          if (archMatch) {
            const arch = JSON.parse(archMatch[0]);
            state.archetype = arch.archetype || "未检测";
          }
        } catch (err) {
          console.error("Archetype detection failed:", err instanceof Error ? err.message : String(err));
          emit(controller, { type: "error", message: "Archetype 检测失败，使用默认分类" });
          state.archetype = "未检测";
        }

        emit(controller, { type: "phase", phase: "archetype_detected", archetype: state.archetype });
        if (signal?.aborted) { controller.close(); return; }

        /* ── Fetch CV data for block B/E/F matching ── */
        let cvTextEffective = cvText || "";
        if (!cvTextEffective) {
          try {
            const origin = request.headers.get("origin") || "http://localhost:3000";
            const cookie = request.headers.get("cookie") || "";
            const cvRes = await fetch(`${origin}/api/cv/data`, { headers: cookie ? { cookie } : undefined, signal }).catch(() => null);
            if (cvRes?.ok) {
              const cvJson = await cvRes.json();
              const cv = cvJson?.data;
              if (cv?.versions && cv?.activeVersion) {
                const sections = cv.versions[cv.activeVersion]?.sections;
                if (Array.isArray(sections)) {
                  cvTextEffective = sections
                    .filter((s: { content: string }) => s.content?.trim())
                    .map((s: { title: string; content: string }) => `【${s.title}】\n${s.content}`)
                    .join("\n\n");
                }
              }
            }
          } catch { /* non-blocking */ }
        }

        /* ── Blocks A-G ── */
        const blockKeys = ["a", "b", "c", "d", "e", "f", "g"] as const;
        const blockLabels: Record<string, string> = {
          a: "A · 职位概览", b: "B · 简历匹配", c: "C · 职级与策略",
          d: "D · 薪资与市场", e: "E · 定制化方案", f: "F · 面试准备", g: "G · 职位合法性",
        };

        const today = new Date().toISOString().split("T")[0];
        const todayCN = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

        // Archetype-specific brief for each block
        const archBrief = `当前JD Archetype: ${state.archetype}。`;

        // Block-specific prompts (focused, not full modes)
        const blockPrompts: Record<string, { sys: string; user: string }> = {
          a: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「A板块·职位概览」，不要涉及其他板块。提取JD中的关键信息填入表格，包含：Archetype、领域、职能、职级、工作模式、团队规模、一句话TL;DR。用中文markdown表格输出。`,
            user: `JD:\n${state.jdText.slice(0, 5000)}\n\n${archBrief}`,
          },
          b: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「B板块·简历匹配」，不要涉及其他板块。逐条对照JD要求与候选人简历，标注匹配/缺口/应对策略。${cvTextEffective ? '简历已提供，请精确匹配并引用简历行号。' : '无简历，请列出JD要求并标注"待提供简历"。'}Archetype策略: ${state.archetype === 'AI产品经理' ? '优先PRD、产品规划、数据驱动决策的证据' : state.archetype === 'AI运营' ? '优先增长指标、AI工具应用、A/B测试' : '优先相关领域经验'}。用中文markdown表格输出。`,
            user: `${cvTextEffective ? `候选人简历:\n${cvTextEffective.slice(0, 6000)}\n\n` : ""}JD:\n${state.jdText.slice(0, 4000)}\n\n${archBrief}`,
          },
          c: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「C板块·职级与策略」，不要涉及其他板块。分析JD职级要求，对照中国互联网职级体系(P6/P7/P8等)，给出"卖senior不撒谎"方案和被downlevel应对策略。用中文markdown输出。`,
            user: `JD:\n${state.jdText.slice(0, 4000)}\n\n${archBrief}`,
          },
          d: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「D板块·薪资与市场」，不要涉及其他板块。分析薪资竞争力（税前月薪、五险一金、年终奖、加班情况）。${state.searchInfo ? `参考数据: ${state.searchInfo}` : '无公开数据，基于行业估算并标注。'}用中文markdown表格输出。`,
            user: `公司: ${state.company || "未知"}\n岗位: ${state.role || "未知"}\nJD:\n${state.jdText.slice(0, 3000)}`,
          },
          e: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「E板块·定制化方案」，不要涉及其他板块。给出简历5项具体修改建议(修改前→修改后→原因)，格式为markdown表格。用中文输出。`,
            user: `JD:\n${state.jdText.slice(0, 4000)}\n\n${archBrief}${cvTextEffective ? `\n候选人简历:\n${cvTextEffective.slice(0, 3000)}` : ""}`,
          },
          f: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「F板块·面试准备」，不要涉及其他板块。生成6-10个STAR+R面试故事(情境-任务-行动-结果-反思)，和红线问题应对话术。用中文markdown表格输出。${state.archetype}对应策略: 强调该岗位相关的项目经验和量化成果。`,
            user: `JD:\n${state.jdText.slice(0, 4000)}\n\n${archBrief}${cvTextEffective ? `\n候选人简历:\n${cvTextEffective.slice(0, 3000)}` : ""}`,
          },
          g: {
            sys: `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「G板块·职位合法性」，不要涉及其他板块。分析JD是否为真实活跃职位，检测: 薪资是否合理、JD是否有技术细节、是否重复发布、中国平台特有风险(培训公司/猎头收集简历)。给出: 高可信度/谨慎推进/疑似虚假 + 理由。用中文输出。`,
            user: `JD:\n${state.jdText.slice(0, 4000)}\n\n公司: ${state.company || "未知"}\n岗位: ${state.role || "未知"}`,
          },
        };

        for (const bk of blockKeys) {
          if (signal?.aborted) { controller.close(); return; }

          emit(controller, { type: "block_start", block: bk, label: blockLabels[bk] });

          const bp = blockPrompts[bk];

          // Block D: do search first
          if (bk === "d" && allowWebSearch) {
            emit(controller, { type: "search_start", query: `${state.company || "公司"} ${state.role || "岗位"} 薪资`, source: "web" });
            try {
              const sq = `${state.company || ""} ${state.role || ""} 薪资`.trim();
              const sr = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(sq)}&format=json&no_html=1`, { signal }).catch(() => null);
              if (sr?.ok) {
                const sd = await sr.json();
                const abs = sd.Abstract || sd.AbstractText || "";
                if (abs) { state.searchInfo = abs; emit(controller, { type: "search_result", count: 1, summary: abs.slice(0, 300) }); }
              }
            } catch { /* ok */ }
            bp.sys = `你是AI求职评估引擎。当前日期: ${todayCN} (${today})。只生成「D板块·薪资与市场」，不要涉及其他板块。分析薪资竞争力（税前月薪、五险一金、年终奖、加班情况）。${state.searchInfo ? `参考数据: ${state.searchInfo}` : '无公开数据，基于行业估算并标注。'}用中文markdown表格输出。`;
          }

          // Block F: inject story bank
          if (bk === "f") {
            const sp = path.join(process.cwd(), "interview-prep", "story-bank.md");
            if (fs.existsSync(sp)) bp.sys += `\n用户已有故事库:\n${fs.readFileSync(sp, "utf-8").slice(0, 2000)}`;
          }

          // Block G: inject risk scan results (from /api/agent/scan-risks)
          if (bk === "g") {
            emit(controller, { type: "search_start", query: "风险信号扫描", source: "risk-scan" });
            try {
              const origin = request.headers.get("origin") || "http://localhost:3000";
              const risksRes = await Promise.race([
                fetch(`${origin}/api/agent/scan-risks`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ jd_text: state.jdText }),
                  signal,
                }),
                new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
              ]).catch((err) => {
                if (err instanceof Error && err.message === 'timeout') return null;
                throw err;
              });
              if (risksRes?.ok) {
                const risksData = await risksRes.json();
                const riskSignals = (risksData.data || []) as RiskSignal[];
                if (riskSignals.length > 0) {
                  state.riskSignals = riskSignals;
                  const riskText = riskSignals.map((r) => {
                    const badge = r.severity === "critical" ? "🔴" : r.severity === "high" ? "🟠" : "🟡";
                    return `- ${badge} ${r.signal}${r.excerpt ? `: ${r.excerpt}` : ""}`;
                  }).join("\n");
                  bp.sys += `\n\n风险扫描结果（来自 scan-risks API）:\n${riskText}\n请在G板块的合法性分析中引用这些风险信号。`;
                  emit(controller, { type: "search_result", count: riskSignals.length, summary: riskSignals.map(r => r.signal).join("、") });
                }
              }
            } catch { /* non-blocking — proceed without risk signals */ }
          }

          try {
            const content = await streamLLM(bp.sys, bp.user, controller, signal, bk);
            const score = extractScore(content, bk);
            state.blocks[bk] = { content, score };
            emit(controller, { type: "block_done", block: bk });
            emit(controller, { type: "score", block: bk, score });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "unknown";
            emit(controller, { type: "error", block: bk, message: `${errMsg}` });
            state.blocks[bk] = { content: `*生成失败*`, score: 0 };
            emit(controller, { type: "block_done", block: bk });
            emit(controller, { type: "score", block: bk, score: 0 });
          }
        }

        /* ── Compute overall score ── */
        const numericScores = Object.values(state.blocks)
          .map((b) => b.score)
          .filter((s) => s > 0);
        state.overallScore = numericScores.length > 0
          ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length * 10) / 10
          : 3;

        emit(controller, { type: "overall_score", score: state.overallScore });

        /* ── Pre-allocate report number ── */
        let reportNum = 0;
        try {
          const allReports = await getDataRepositories().reports.list(user.userId);
          const maxReportNum = allReports.reduce((max, r) => Math.max(max, r.report_num), 0);
          reportNum = maxReportNum + 1;
        } catch { /* non-blocking */ }

        /* ── Done: return full result data for client to confirm save ── */
        const company = targetCompany?.trim() || state.company || extractFromJD(state.jdText, "company");
        const role = state.role || extractFromJD(state.jdText, "role");

        emit(controller, {
          type: "done",
          company,
          role,
          archetype: state.archetype,
          overallScore: state.overallScore,
          blocks: state.blocks,
          risks: state.riskSignals,
          riskSignals: state.riskSignals,
          jdText: state.jdText,
          reportNum,
        });

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        state.error = `评估中断: ${message}`;
        emit(controller, { type: "error", message: `评估中断: ${message}` });
        emit(controller, { type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/* ── Simple fallback: extract company/role from JD text ── */
function extractFromJD(text: string, field: "company" | "role"): string {
  if (field === "company") {
    const m = text.match(/公司[：:]\s*(.+)/) || text.match(/(?:关于|加入)(\S+公司)/);
    return m ? m[1].trim().slice(0, 30) : "未知公司";
  }
  const m = text.match(/岗位[：:]\s*(.+)/) || text.match(/职位[：:]\s*(.+)/) || text.match(/(?:招聘|诚聘)(.+?)(?:\s|$)/);
  return m ? m[1].trim().slice(0, 40) : "未知岗位";
}
