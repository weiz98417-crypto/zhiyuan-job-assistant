import { validateDocumentFieldContent } from "@/lib/agent/verified-action";

export type ResumeSectionId = "summary" | "experience" | "projects" | "education" | "skills";

type ResumeSaveGuardMessage = { role: string; content: string };

export interface ResumeSavePlan {
  section: ResumeSectionId;
  content: string;
  reason: "direct-pasted-revision" | "recent-optimization-result" | "recent-assistant-proposal";
}

export interface ResumeSectionValidation {
  valid: boolean;
  reason?: string;
}

const SAVE_INTENT_RE = /(应用|保存|写入|确认|采用|用这个|就这个|直接改|帮我改|替我改|改了|没改|没有保存|没保存|落到简历|同步到简历)/i;
const REFERENCE_RESUME_RE = /(优秀|参考|标杆|样例|范例).{0,12}(简历|CV|履历)|(简历|CV|履历).{0,12}(优秀|参考|标杆|样例|范例)/i;
const SAVE_CLAIM_RE = /(已|已经|成功).{0,8}(保存|写入|更新|同步).{0,12}(简历|CV|技能|技能清单|板块)|已更新「.+」板块到 CV/i;

const SECTION_HINTS: Array<[ResumeSectionId, RegExp]> = [
  ["skills", /(技能清单|专业技能|技能|核心能力|技术工具|领域理解|skills?)/i],
  ["projects", /(项目经验|项目经历|项目|projects?)/i],
  ["experience", /(工作经历|实习经历|经历|experience|work)/i],
  ["summary", /(个人概述|个人总结|自我评价|概述|summary)/i],
  ["education", /(教育背景|教育经历|学历|education)/i],
];

const SECTION_MIN_COMPACT_LENGTH: Record<ResumeSectionId, number> = {
  summary: 20,
  experience: 80,
  projects: 80,
  education: 10,
  skills: 20,
};

const NON_RESUME_CONTENT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:替换为|修改为|改为)\s*[：:]?\s*$/i, reason: "内容停在“替换为/改为”占位符，没有真实正文" },
  { pattern: /(?:保持原有|保持不变|不动).{0,40}(?:替换为|修改为|改为)/i, reason: "内容是修改指令，不是可保存的简历正文" },
  { pattern: /(?:工作经历|项目经验|项目经历|技能清单|个人概述).{0,40}→\s*(?:替换为|修改为|改为)\s*[：:]?\s*$/i, reason: "内容是板块替换说明，不是完整板块正文" },
  { pattern: /^\s*\|?\s*修改前\s*\|\s*修改后\s*\|\s*原因\s*\|?/im, reason: "内容是修改对照表，不应直接写入简历" },
  { pattern: /已更新「.+」板块到 CV|打开\s+https?:\/\/localhost/i, reason: "内容是工具结果或页面提示，不是简历正文" },
  { pattern: /(?:达到处理上限|重新提问|被截断|补读完整|正在分析|马上给你结果)/i, reason: "内容包含对话过程或失败提示，不是简历正文" },
];

function cleanRevisionContent(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/^[ \t]*(?:✅|✔️?)?\s*(?:改为|修改后|新版|优化后)\s*[：:]\s*/i, "")
    .replace(/\n\s*(?:模型输出|但是我|我去简历页面|并没有保存|没有保存|啥情况)[\s\S]*$/i, "")
    .replace(/\n\s*(?:🔄\s*)?原版[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferSectionId(...texts: string[]): ResumeSectionId {
  const joined = texts.filter(Boolean).join("\n");
  for (const [section, pattern] of SECTION_HINTS) {
    if (pattern.test(joined)) return section;
  }
  return "experience";
}

function isSubstantialRevision(content: string): boolean {
  const compact = content.replace(/\s/g, "");
  return compact.length >= 20 && validateResumeSectionContent("skills", content, { skipMinLength: true }).valid && !/(请确认|回复|选择|保存哪|要用哪)/.test(content);
}

export function validateResumeSectionContent(
  section: ResumeSectionId,
  content: string,
  options: { skipMinLength?: boolean } = {},
): ResumeSectionValidation {
  const trimmed = content.replace(/\r/g, "").trim();
  const compact = trimmed.replace(/\s/g, "");
  if (!compact) return { valid: false, reason: "内容为空" };

  for (const { pattern, reason } of NON_RESUME_CONTENT_PATTERNS) {
    if (pattern.test(trimmed)) return { valid: false, reason };
  }

  const minLength = SECTION_MIN_COMPACT_LENGTH[section];
  if (!options.skipMinLength && compact.length < minLength) {
    return { valid: false, reason: `内容过短，不像完整的${section === "projects" ? "项目经验" : "简历"}板块` };
  }

  const generic = validateDocumentFieldContent(trimmed, {
    minCompactLength: options.skipMinLength ? 1 : minLength,
    targetLabel: section,
  });
  if (!generic.valid) return { valid: false, reason: generic.reason || "内容未通过写入校验" };

  return { valid: true };
}

function extractAfterRevisionMarker(text: string): string | null {
  const marker = text.match(/(?:✅|✔️?)?\s*(?:改为|修改后|新版|优化后)\s*[：:]/i);
  if (!marker || marker.index === undefined) return null;
  const after = text.slice(marker.index + marker[0].length);
  const cleaned = cleanRevisionContent(after);
  return isSubstantialRevision(cleaned) ? cleaned : null;
}

function requestedVariantIndex(userText: string): number {
  if (/(第三|第3|方案\s*3|版本\s*3)/i.test(userText)) return 2;
  if (/(第二|第2|方案\s*2|版本\s*2)/i.test(userText)) return 1;
  return 0;
}

function extractVariantFromOptimization(content: string, userText: string): string | null {
  if (!/优化方案|改写方案|###/.test(content)) return null;
  const variants: string[] = [];
  const headings = Array.from(content.matchAll(/^###\s+.+$/gm));
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? content.length;
    const cleaned = content.slice(start, end)
      .replace(/^\*?策略[：:][\s\S]*?$/gim, "")
      .replace(/\n\s*(?:---|⚠️)[\s\S]*$/i, "")
      .trim();
    if (isSubstantialRevision(cleaned)) variants.push(cleaned);
  }
  if (variants.length > 0) return variants[Math.min(requestedVariantIndex(userText), variants.length - 1)];

  const body = content
    .replace(/^##\s+.+优化方案\s*/m, "")
    .replace(/\n\s*(?:---|⚠️)[\s\S]*$/i, "")
    .trim();
  return isSubstantialRevision(body) ? body : null;
}

function recentMessages(messages: ResumeSaveGuardMessage[]): ResumeSaveGuardMessage[] {
  return messages.slice(Math.max(0, messages.length - 8));
}

export function buildResumeSavePlan(messages: ResumeSaveGuardMessage[], toolWhitelist?: string[]): ResumeSavePlan | null {
  if (toolWhitelist && !toolWhitelist.includes("save_resume_section")) return null;
  const latestUser = [...messages].reverse().find((message) => message.role === "user" && message.content.trim());
  const userText = latestUser?.content || "";
  if (!SAVE_INTENT_RE.test(userText)) return null;
  if (REFERENCE_RESUME_RE.test(userText)) return null;

  const pasted = extractAfterRevisionMarker(userText);
  if (pasted) {
    const section = inferSectionId(userText, pasted);
    if (!validateResumeSectionContent(section, pasted).valid) return null;
    return {
      section,
      content: pasted,
      reason: "direct-pasted-revision",
    };
  }

  for (const message of recentMessages(messages).reverse()) {
    if (message === latestUser) continue;
    const content = message.content || "";
    const optimized = extractVariantFromOptimization(content, userText);
    if (optimized) {
      const section = inferSectionId(userText, content);
      if (!validateResumeSectionContent(section, optimized).valid) continue;
      return {
        section,
        content: optimized,
        reason: "recent-optimization-result",
      };
    }
    const proposal = extractAfterRevisionMarker(content);
    if (proposal) {
      const section = inferSectionId(userText, content, proposal);
      if (!validateResumeSectionContent(section, proposal).valid) continue;
      return {
        section,
        content: proposal,
        reason: "recent-assistant-proposal",
      };
    }
  }

  return null;
}

export function claimsResumeSaved(text: string): boolean {
  return SAVE_CLAIM_RE.test(text) || /(?:successfully|already|has been).{0,12}(?:saved|updated|written).{0,20}(?:resume|cv)/i.test(text);
}

export function sanitizeUnsupportedResumeSaveClaim(text: string, saveSucceeded: boolean): string {
  if (saveSucceeded || !claimsResumeSaved(text)) return text;
  return [
    "我刚才只生成了修改方案，还没有真正写入简历页面。",
    "",
    "请回复「应用这个技能清单」或「保存到技能板块」，我会调用保存工具写入当前简历。",
  ].join("\n");
}
