/**
 * Lightweight client-side signal scanner.
 * Scans user messages for extractable profile signals without relying on AI tool calls.
 */

export interface ExtractedSignal {
  signal_type: "skill_claim" | "role_preference" | "dealbreaker" | "company_pref" | "salary_expectation" | "raw_context";
  content_json: Record<string, unknown>;
  session_id: string;
}

const SKILL_PATTERNS = [
  /(?:我擅长|我做过|精通|熟悉|我会|掌握|懂|专注|具备|拥有)(?:[\s\S]{0,15}?)([\u4e00-\u9fff\w]{2,20}(?:[\u4e00-\u9fff\w]{0,10})?)/g,
  /(?:有\d+年)[\s\S]{0,10}?([\u4e00-\u9fff\w]{2,20}(?:经验|背景))/g,
  /(?:负责|主导|管理|领导|推动|驱动|设计|开发|搭建|构建|落地)[\s\S]{0,15}?([\u4e00-\u9fff\w]{2,20}(?:产品|项目|团队|平台|系统|业务|算法|模型|架构|数据|方案|策略|流程|体系|能力))/g,
];

const ROLE_PATTERNS = [
  /(?:我想做|目标是|考虑转|想做|适合做|方向是|岗位是|定位)[\s\S]{0,10}?([\u4e00-\u9fff\w]{2,15}(?:经理|工程师|设计师|负责人|总监|运营|产品|开发|架构|专家|顾问|主管|专员))/g,
  /(?:我是|我目前是|我现在是|我担任|我在做|我从事|我做|作为)[\s\S]{0,20}?([\u4e00-\u9fff\w]{2,25}(?:负责人|经理|工程师|设计师|总监|运营|产品|开发|架构|专家|顾问|主管|专员|产品负责人|产品经理|组长|leader|lead|head|VP|负责人|主任|科学家|研究员))/gi,
  /(?:AI|前端|后端|全栈|算法|数据|测试|运维|安全|架构)[\u4e00-\u9fff\w]{0,10}(?:工程师|经理|总监)/g,
];

const DEALBREAKER_PATTERNS = [
  /(?:不接受|不考虑|排斥|拒绝|不去|不要|坚决不|绝对不)[\s\S]{0,30}?([\u4e00-\u9fff\d，,。.！!]{2,40}?)/g,
  /(?:996|007|大小周|外包|驻场|派遣)\S*/g,
  /(?:必须|一定|得有|要有|需要|要求|只要)[\s\S]{0,15}?(带薪休假|双休|五险一金|公积金|年假|弹性工作|远程|在家办公|补充医疗|体检|期权|股票|年终奖|13薪|14薪|15薪|16薪)/g,
  /(带薪休假|双休|五险一金|公积金|年假|弹性工作|远程|在家办公|补充医疗|体检|期权|股票|年终奖|13薪|14薪|15薪|16薪)[\s\S]{0,10}?(?:必须|一定|得有|要有|需要)/g,
];

const SALARY_PATTERNS = [
  /(\d{1,3})\s*[kK]\b/g,
  /(\d{1,2})\s*[万千]/g,
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

const POSITIVE_COMPANY_WORDS = /(?:想去|喜欢|看好|不错|挺好|可以考虑|想投|目标|dream)/;
const NEGATIVE_COMPANY_WORDS = /(?:不去|不考虑|不投|不看好|不太行|算了|黑了)/;

export function scanMessage(content: string, sessionId: string): ExtractedSignal[] {
  const signals: ExtractedSignal[] = [];

  // Skill claims
  for (const pattern of SKILL_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(content)) !== null) {
      const skill = (m[1] || "").trim();
      if (skill.length >= 2) {
        signals.push({
          signal_type: "skill_claim",
          content_json: { skill, evidence: m[0].trim(), confidence: 0.6 },
          session_id: sessionId,
        });
      }
    }
  }

  // Role preferences
  for (const pattern of ROLE_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(content)) !== null) {
      const role = (m[1] || m[0]).trim();
      if (role.length >= 2) {
        signals.push({
          signal_type: "role_preference",
          content_json: { role, evidence: m[0].trim(), confidence: 0.7 },
          session_id: sessionId,
        });
      }
    }
  }

  // Dealbreakers
  for (const pattern of DEALBREAKER_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(content)) !== null) {
      const value = (m[1] || m[0]).trim();
      if (value.length >= 2) {
        signals.push({
          signal_type: "dealbreaker",
          content_json: { value, evidence: m[0].trim(), confidence: 0.8 },
          session_id: sessionId,
        });
      }
    }
  }

  // Salary expectations
  for (const pattern of SALARY_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(content)) !== null) {
      const amount = parseInt(m[1]);
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

  // Company preferences
  for (const company of COMPANY_NAMES) {
    if (content.includes(company)) {
      const idx = content.indexOf(company);
      const ctxStart = Math.max(0, idx - 15);
      const ctxEnd = Math.min(content.length, idx + company.length + 15);
      const ctx = content.slice(ctxStart, ctxEnd);

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
 * When regex finds few or no classified signals but the message is substantial,
 * create a raw_context signal so the LLM can do semantic extraction later.
 */
export function maybeRawContext(content: string, classifiedCount: number, sessionId: string): ExtractedSignal | null {
  // Only submit if message has substance but regex missed things
  const trimmed = content.trim();
  if (trimmed.length < 15) return null;
  if (classifiedCount >= 3) return null; // regex already did well

  // Simple hash to deduplicate identical messages
  const hash = String(trimmed.length) + "_" + trimmed.charCodeAt(0) + trimmed.charCodeAt(trimmed.length - 1);

  return {
    signal_type: "raw_context",
    content_json: { text: trimmed, hash, length: trimmed.length },
    session_id: sessionId,
  };
}
