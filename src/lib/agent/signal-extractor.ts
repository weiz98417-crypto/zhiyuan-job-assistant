/**
 * Lightweight profile signal scanner.
 *
 * Important: this is only a first-pass collector. It must not turn JD
 * requirements, interview questions, or chat filler into profile skills.
 */

import {
  looksLikeProfileNoise,
  normalizeDealBreaker,
  normalizeSkillClaim,
  shouldCaptureProfileRawContext,
} from "@/lib/profile-skill-quality";

export interface ExtractedSignal {
  signal_type: "skill_claim" | "role_preference" | "dealbreaker" | "company_pref" | "salary_expectation" | "raw_context";
  content_json: Record<string, unknown>;
  session_id: string;
}

const SKILL_PATTERNS = [
  /(?:我熟悉|我做过|我会|我掌握|我擅长|我负责过|我参与过|我主导过|具备|拥有|熟练使用|落地过|搭建过|建设过|优化过)(?:[\s\S]{0,12}?)([\u4e00-\u9fffA-Za-z0-9.+#/-]{2,24})/g,
  /(?:负责|主导|参与|搭建|构建|设计|开发|落地|优化|治理|分析|推进|协同)(?:[\s\S]{0,10}?)([\u4e00-\u9fffA-Za-z0-9.+#/-]{2,24}(?:方案|系统|平台|能力|工具|流程|模型|算法|数据|产品|项目|框架|引擎|体系|管理|分析)?)/g,
];

const ROLE_PATTERNS = [
  /(?:我想做|目标是|考虑转|想做|适合做|方向是|岗位是|定位)(?:[\s\S]{0,10}?)([\u4e00-\u9fffA-Za-z0-9.+#/-]{2,20}(?:经理|工程师|设计师|负责人|总监|运营|产品|开发|架构|专家|顾问|主管|专员))/g,
  /(?:我是|我目前是|我现在是|我担任|我在做|我从事|我做|作为)(?:[\s\S]{0,18}?)([\u4e00-\u9fffA-Za-z0-9.+#/-]{2,25}(?:负责人|经理|工程师|设计师|总监|运营|产品|开发|架构|专家|顾问|主管|专员|组长|leader|lead|head|VP|主任|科学家|研究员))/gi,
];

const DEALBREAKER_PATTERNS = [
  /(?:不接受|不考虑|排斥|拒绝|不去|不要|坚决不|绝对不)(?:[\s\S]{0,30}?)([\u4e00-\u9fff\d，,、。；;\s]{2,40})/g,
  /(996|007|大小周|外包|驻场|派遣)\S*/g,
  /(?:必须|一定|得有|要有|需要|要求|只要)(?:[\s\S]{0,15}?)(带薪休假|双休|五险一金|公积金|年假|弹性工作|远程|在家办公|补充医疗|体检|期权|股票|13薪|14薪|15薪|16薪)/g,
];

const SALARY_PATTERNS = [
  /(\d{1,3})\s*[kK]\b/g,
  /薪资.*?(\d{1,3})\s*[kK]/g,
  /不低于\s*(\d{1,3})\s*[kK]/g,
  /最少\s*(\d{1,3})\s*[kK]/g,
];

const COMPANY_NAMES = [
  "字节跳动", "阿里巴巴", "腾讯", "百度", "美团", "滴滴", "京东", "拼多多",
  "小红书", "B站", "知乎", "快手", "网易", "华为", "小米", "OPPO", "vivo",
  "Anthropic", "OpenAI", "Google", "Microsoft", "Meta", "Apple",
  "商汤", "旷视", "依图", "云从", "智谱", "月之暗面", "百川", "MiniMax",
  "科大讯飞", "寒武纪", "地平线", "Momenta", "文远知行", "小马智行",
];

const POSITIVE_COMPANY_WORDS = /(?:想去|喜欢|看好|不错|挺好|可以考虑|想投|目标|dream)/i;
const NEGATIVE_COMPANY_WORDS = /(?:不去|不考虑|不投|不看好|不太行|算了|黑了)/;

function compact(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function hasUserOwnership(text: string): boolean {
  return /(我|本人|我的|自己|简历|实习|项目中|工作中|曾|负责|主导|参与|搭建|开发|设计|落地|优化|使用|熟悉|掌握|做过)/.test(text);
}

export function scanMessage(content: string, sessionId: string): ExtractedSignal[] {
  const signals: ExtractedSignal[] = [];
  const text = compact(content);

  if (!text || looksLikeProfileNoise(text)) return signals;

  for (const pattern of SKILL_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const evidence = m[0].trim();
      if (!hasUserOwnership(evidence)) continue;
      const normalized = normalizeSkillClaim({
        skill: m[1],
        evidence,
        confidence: 0.58,
        source: "auto",
      });
      if (!normalized) continue;
      signals.push({
        signal_type: "skill_claim",
        content_json: {
          skill: normalized.skill,
          evidence: normalized.evidence,
          confidence: normalized.confidence,
        },
        session_id: sessionId,
      });
    }
  }

  for (const pattern of ROLE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const role = (m[1] || m[0]).trim();
      if (role.length >= 2 && role.length <= 30 && !looksLikeProfileNoise(role)) {
        signals.push({
          signal_type: "role_preference",
          content_json: { role, evidence: m[0].trim(), confidence: 0.68 },
          session_id: sessionId,
        });
      }
    }
  }

  for (const pattern of DEALBREAKER_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const evidence = m[0].trim();
      const value = normalizeDealBreaker(m[1] || m[0], evidence);
      if (value) {
        signals.push({
          signal_type: "dealbreaker",
          content_json: { value, evidence, confidence: 0.8 },
          session_id: sessionId,
        });
      }
    }
  }

  for (const pattern of SALARY_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const amount = parseInt(m[1], 10);
      if (amount >= 8 && amount <= 200) {
        signals.push({
          signal_type: "salary_expectation",
          content_json: {
            min: amount,
            max: Math.round(amount * 1.3),
            evidence: m[0].trim(),
            confidence: 0.5,
          },
          session_id: sessionId,
        });
      }
    }
  }

  for (const company of COMPANY_NAMES) {
    if (!text.includes(company)) continue;
    const idx = text.indexOf(company);
    const ctxStart = Math.max(0, idx - 15);
    const ctxEnd = Math.min(text.length, idx + company.length + 15);
    const ctx = text.slice(ctxStart, ctxEnd);
    const liked = POSITIVE_COMPANY_WORDS.test(ctx);
    const disliked = NEGATIVE_COMPANY_WORDS.test(ctx);
    if (liked || disliked) {
      signals.push({
        signal_type: "company_pref",
        content_json: { company, liked, disliked, evidence: ctx.trim(), confidence: 0.55 },
        session_id: sessionId,
      });
    }
  }

  return signals;
}

/**
 * Deduplicate signals within the same session.
 * Returns only signals whose (signal_type + key content) haven't been seen before.
 */
export function deduplicateSignals(
  signals: ExtractedSignal[],
  seenKeys: Set<string>,
): ExtractedSignal[] {
  const result: ExtractedSignal[] = [];
  for (const s of signals) {
    const key = signalKey(s);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(s);
    }
  }
  return result;
}

function signalKey(s: ExtractedSignal): string {
  const content = s.content_json;
  switch (s.signal_type) {
    case "skill_claim": return `skill:${content.skill}`;
    case "role_preference": return `role:${content.role}`;
    case "dealbreaker": return `dealbreaker:${content.value}`;
    case "company_pref": return `company:${content.company}`;
    case "salary_expectation": return `salary:${content.min}`;
    case "raw_context": return `raw:${(content.hash as string) || ""}`;
    default: return JSON.stringify(content);
  }
}

/**
 * Store raw context only when it is likely to describe the user, not a JD,
 * interview prompt, or model output.
 */
export function maybeRawContext(content: string, classifiedCount: number, sessionId: string): ExtractedSignal | null {
  const trimmed = compact(content);
  if (classifiedCount >= 2) return null;
  if (!shouldCaptureProfileRawContext(trimmed)) return null;

  const hash = `${trimmed.length}_${trimmed.charCodeAt(0)}_${trimmed.charCodeAt(trimmed.length - 1)}`;

  return {
    signal_type: "raw_context",
    content_json: { text: trimmed, hash, length: trimmed.length },
    session_id: sessionId,
  };
}
