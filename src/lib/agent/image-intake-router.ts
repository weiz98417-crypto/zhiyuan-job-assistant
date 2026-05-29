import type { ImageDocumentType, ImageIntakeResult } from "@/lib/agent/image-intake";

export type ImageIntakeRoute =
  | "evaluate_jd"
  | "evaluate_offer"
  | "resume_preview"
  | "describe_image"
  | "clarify_intent"
  | "retry_image";

export interface ImageIntakeRoutingDecision {
  route: ImageIntakeRoute;
  reason: string;
  documentType: ImageDocumentType;
  confidence: number;
  quality?: ImageIntakeResult["quality"];
  matchedIntent: ImageDocumentType | "general" | "unknown";
  clarificationQuestion?: string;
  retryHint?: string;
}

const JD_INTENT_RE = /(?:\bjd\b|job description|职位|岗位|招聘|任职要求|职责|评估.*jd|分析.*jd)/i;
const OFFER_INTENT_RE = /(?:\boffer\b|录用|薪资|待遇|谈判|评估.*offer|分析.*offer)/i;
const RESUME_INTENT_RE = /(?:\bcv\b|\bresume\b|简历|履历|评估.*简历|分析.*简历)/i;
const GENERAL_INTENT_RE = /(?:评估|分析|看看|帮我|识别|处理|解读|判断|提取|总结)/i;

const LOW_CONFIDENCE_THRESHOLD = 0.62;
const CLEAR_CONFIDENCE_THRESHOLD = 0.8;
const CHAT_SURFACE_RE = /(聊天|对话|会话|chat|conversation|message)/i;
const THUMBNAIL_SURFACE_RE = /(缩略|预览|嵌套|小图|右上|太小|读不清|无法识别|无法辨认|thumbnail|preview|embedded|tiny|too small|unreadable)/i;

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim();
}

function hasStructuredData(intake?: ImageIntakeResult | null): boolean {
  return Boolean(intake?.structured && Object.keys(intake.structured).length > 0);
}

function inferTextIntent(text: string): ImageDocumentType | "general" | "unknown" {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";

  const matches: ImageDocumentType[] = [];
  if (JD_INTENT_RE.test(trimmed)) matches.push("jd");
  if (OFFER_INTENT_RE.test(trimmed)) matches.push("offer");
  if (RESUME_INTENT_RE.test(trimmed)) matches.push("resume");

  if (matches.length > 1) return "unknown";
  if (matches[0]) return matches[0];
  if (GENERAL_INTENT_RE.test(trimmed)) return "general";
  return "unknown";
}

function resolveDocumentType(intake?: ImageIntakeResult | null): ImageDocumentType {
  return intake?.documentType && intake.documentType !== "unknown"
    ? intake.documentType
    : "unknown";
}

function shouldRetry(intake?: ImageIntakeResult | null): boolean {
  if (!intake) return true;
  const confidence = intake.confidence ?? 0;
  const quality = intake.quality;
  const extractedText = cleanText(intake.extractedText);
  const weakText = extractedText.length < 24 && !hasStructuredData(intake);
  const unusableQuality = quality === "thumbnail" || quality === "unreadable";
  const lowQuality = quality === "thumbnail" || quality === "blurred" || quality === "unreadable";
  return (
    unusableQuality ||
    confidence > 0 && confidence < LOW_CONFIDENCE_THRESHOLD ||
    confidence > 0 && confidence < CLEAR_CONFIDENCE_THRESHOLD && lowQuality ||
    weakText
  );
}

function hasNestedThumbnailSignal(intake?: ImageIntakeResult | null): boolean {
  if (!intake) return false;
  const text = [
    intake.documentType,
    intake.quality,
    intake.reason,
    intake.extractedText,
    ...(intake.perImage || []).map((item) => `${item.documentType || ""} ${item.reason || ""} ${item.candidate || ""}`),
  ].filter(Boolean).join("\n");
  const hasChatSurface = intake.documentType === "chat_screenshot" || CHAT_SURFACE_RE.test(text);
  const hasThumbnailSurface = intake.quality === "thumbnail" || THUMBNAIL_SURFACE_RE.test(text);
  const unreadableNestedPreview =
    intake.quality === "unreadable" && hasChatSurface && THUMBNAIL_SURFACE_RE.test(text);
  return (hasChatSurface && hasThumbnailSurface) || unreadableNestedPreview;
}

function makeClarifyQuestion(documentType: ImageDocumentType, matchedIntent: ImageDocumentType | "general" | "unknown"): string {
  if (documentType === "resume") {
    return "我识别到这像是简历截图。我会先提取并预览内容，等你确认后再保存到简历里。";
  }
  if (documentType === "jd") {
    if (matchedIntent === "offer") {
      return "这张图看起来更像 JD，不像 Offer。你要我按 JD 评估，还是重新上传 Offer 截图？";
    }
    return "我识别到这像是 JD 截图。你要我先评估，还是先帮你提取关键内容？";
  }
  if (documentType === "offer") {
    if (matchedIntent === "jd") {
      return "这张图看起来更像 Offer，不像 JD。你要我按 Offer 评估，还是重新上传 JD 截图？";
    }
    return "我识别到这像是 Offer 截图。你要我先评估，还是先帮你提取关键内容？";
  }
  return "这张图我已经识别到一些内容，但还不够确定。你想让我按 JD、Offer 还是简历来处理？";
}

export function routeImageIntake(
  userText: string,
  intake?: ImageIntakeResult | null,
): ImageIntakeRoutingDecision {
  const documentType = resolveDocumentType(intake);
  const matchedIntent = inferTextIntent(userText);
  const confidence = intake?.confidence ?? 0;
  const quality = intake?.quality;
  const extractedText = cleanText(intake?.extractedText);
  const hasUsefulExtraction = extractedText.length >= 24 || hasStructuredData(intake);
  const weak = shouldRetry(intake);
  const pureImage = matchedIntent === "unknown";

  if (hasNestedThumbnailSignal(intake)) {
    return {
      route: "retry_image",
      reason: "这张图像更像是聊天窗口里的小图预览，不是可稳定 OCR 的原始文档截图",
      retryHint: "请在 DingTalk/微信/招聘 App 里先点开图片大图，再保存或复制原图上传。聊天窗口缩略图即使放大，也无法恢复完整 JD/Offer 文字。",
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  if (documentType === "resume") {
    if (weak) {
      return {
        route: "retry_image",
        reason: "简历截图识别结果不够稳定",
        retryHint: "请换一张更清晰的原始简历截图，或直接粘贴简历文本。",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }
    return {
      route: "resume_preview",
      reason: "识别到简历截图，先预览并等待确认保存",
      clarificationQuestion: makeClarifyQuestion(documentType, matchedIntent),
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  if (documentType === "jd" || documentType === "offer") {
    if (matchedIntent !== "unknown" && matchedIntent !== "general" && matchedIntent !== documentType) {
      return {
        route: "clarify_intent",
        reason: "用户文本和图片内容不一致，需要先确认目标",
        clarificationQuestion: makeClarifyQuestion(documentType, matchedIntent),
        retryHint: documentType === "jd"
          ? "如果传错了图，可以重新上传 JD 原图。"
          : "如果传错了图，可以重新上传 Offer 原图。",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }

    if (weak || !hasUsefulExtraction) {
      return {
        route: "retry_image",
        reason: documentType === "jd"
          ? "JD 图片太小或 OCR 结果不够稳定"
          : "Offer 图片太小或 OCR 结果不够稳定",
        retryHint: documentType === "jd"
          ? "请换一张更清晰的原始 JD 截图，或直接粘贴 JD 文本/链接。"
          : "请换一张更清晰的原始 Offer 截图，或直接粘贴 Offer 文本。",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }

    if (pureImage) {
      return {
        route: "clarify_intent",
        reason: "只上传图片时，需要先确认用户想做什么",
        clarificationQuestion: makeClarifyQuestion(documentType, matchedIntent),
        retryHint: documentType === "jd"
          ? "也可以直接粘贴 JD 文本，或上传更清晰的原图。"
          : "也可以直接粘贴 Offer 文本，或上传更清晰的原图。",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }

    if (documentType === "jd" && (matchedIntent === "jd" || matchedIntent === "general")) {
      return {
        route: "evaluate_jd",
        reason: "JD 文本意图与 JD 图片一致，进入评估流程",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }

    if (documentType === "offer" && (matchedIntent === "offer" || matchedIntent === "general")) {
      return {
        route: "evaluate_offer",
        reason: "Offer 文本意图与 Offer 图片一致，进入评估流程",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }
  }

  if (documentType === "chat_screenshot") {
    return {
      route: "describe_image",
      reason: "识别到聊天截图，不进入求职业务流",
      clarificationQuestion: "这看起来像是一张聊天截图。我可以简单描述内容，也可以继续看你要不要换成 JD、Offer、简历来处理。",
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  if (documentType === "unknown") {
    if (weak) {
      return {
        route: "retry_image",
        reason: "图片识别置信度太低，建议换清晰原图",
        retryHint: "请换一张更清晰的原始截图，或把图片裁剪到只保留正文区域。",
        documentType,
        confidence,
        quality,
        matchedIntent,
      };
    }

    return {
      route: pureImage ? "clarify_intent" : "describe_image",
      reason: "图片类型暂时无法稳定判断",
      clarificationQuestion: pureImage
        ? "这张图我已经看到了，但还不够确定。你想让我按 JD、Offer 还是简历来处理？"
        : "这张图不太像 JD、Offer 或简历。你想让我先描述图里内容，还是换一张图？",
      retryHint: "也可以直接上传原图，或者粘贴文字。",
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  if (matchedIntent === "jd") {
    return {
      route: "retry_image",
      reason: "文本说的是 JD，但图片还没稳定识别出来",
      retryHint: "请换一张更清晰的原始 JD 截图，或直接粘贴 JD 文本/链接。",
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  if (matchedIntent === "offer") {
    return {
      route: "retry_image",
      reason: "文本说的是 Offer，但图片还没稳定识别出来",
      retryHint: "请换一张更清晰的原始 Offer 截图，或直接粘贴 Offer 文本。",
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  if (matchedIntent === "resume") {
    return {
      route: "retry_image",
      reason: "文本说的是简历，但图片还没稳定识别出来",
      retryHint: "请换一张更清晰的原始简历截图，或直接粘贴简历文本。",
      documentType,
      confidence,
      quality,
      matchedIntent,
    };
  }

  return {
    route: "clarify_intent",
    reason: "需要先确认图片要走哪条业务流",
    clarificationQuestion: "这张图我已经识别到一些内容，但还不够明确。你要我按 JD、Offer 还是简历来处理？",
    retryHint: "也可以直接上传更清晰的原图，或者把文字贴出来。",
    documentType,
    confidence,
    quality,
    matchedIntent,
  };
}

export function buildImageIntakeStatusText(
  userText: string,
  intake?: ImageIntakeResult | null,
): string {
  const route = routeImageIntake(userText, intake);
  const lines = [
    `识别结果：${route.documentType}`,
    `置信度：${Math.round((route.confidence || 0) * 100)}%`,
    `质量：${route.quality || "unknown"}`,
    `路由：${route.route}`,
    `原因：${route.reason}`,
  ];
  if (route.clarificationQuestion) lines.push(`追问：${route.clarificationQuestion}`);
  if (route.retryHint) lines.push(`建议：${route.retryHint}`);
  return lines.join("\n");
}

export function buildImageRouteAssistantReply(
  decision: ImageIntakeRoutingDecision,
  intake?: ImageIntakeResult | null,
): string {
  const extractedText = cleanText(intake?.extractedText);
  const preview = extractedText
    ? extractedText.slice(0, 600) + (extractedText.length > 600 ? "..." : "")
    : "";

  if (decision.route === "clarify_intent") {
    return [
      decision.clarificationQuestion || "这张图我已经识别到一些内容，但还需要你确认要按哪类材料处理。",
      preview ? `\n我先看到的文字片段：\n${preview}` : "",
    ].filter(Boolean).join("\n");
  }

  if (decision.route === "retry_image") {
    return [
      decision.reason,
      decision.retryHint || "请换一张更清晰的原始截图，或直接粘贴文字。",
    ].filter(Boolean).join("\n\n");
  }

  if (decision.route === "resume_preview") {
    return [
      "我识别到这像是一份简历截图。先给你预览提取内容，确认后我再保存到简历里。",
      preview ? `\n提取预览：\n${preview}` : "\n但这张图里的文字还不够完整，建议换更清晰的原图或直接粘贴简历文本。",
      "\n要保存的话，回复「保存到简历」；如果需要修改，直接告诉我改哪里。",
    ].join("\n");
  }

  if (decision.route === "describe_image") {
    return [
      "这张图目前没有被识别为 JD、Offer 或简历，所以我不会把它送进求职评估流程。",
      preview ? `\n图中可读文字片段：\n${preview}` : "",
      "\n你可以告诉我想分析图片里的哪部分，或重新上传 JD / Offer / 简历截图。",
    ].filter(Boolean).join("\n");
  }

  return decision.clarificationQuestion || decision.reason || "我需要先确认这张图要怎么处理。";
}

export function buildImageIntakeToolSummary(
  decision: ImageIntakeRoutingDecision,
  intake?: ImageIntakeResult | null,
): string {
  const extractedText = cleanText(intake?.extractedText);
  const preview = extractedText
    ? extractedText.slice(0, 180) + (extractedText.length > 180 ? "..." : "")
    : "";
  return [
    `documentType=${decision.documentType}`,
    `route=${decision.route}`,
    `confidence=${Math.round((decision.confidence || 0) * 100) / 100}`,
    `quality=${decision.quality || "unknown"}`,
    `reason=${decision.reason}`,
    preview ? `preview=${preview}` : null,
  ].filter(Boolean).join("\n");
}
