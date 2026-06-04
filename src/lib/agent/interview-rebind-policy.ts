export type InterviewMaterialKind = "jd" | "resume" | "unknown";

export type InterviewMaterialIntent =
  | "continue_current_session"
  | "use_as_supporting_context"
  | "switch_active_material"
  | "restart_as_new_interview"
  | "needs_clarification";

export interface InterviewMaterialReferenceDecision {
  intent: InterviewMaterialIntent;
  materialKind: InterviewMaterialKind;
  confidence: "high" | "medium" | "low";
  explicit: boolean;
  query: string;
  reason: string;
}

const JD_PATTERN = /\bJD\b|岗位|职位|招聘|job description|job post|position/i;
const RESUME_PATTERN = /简历|履历|resume|cv/i;
const MATERIAL_PATTERN = new RegExp(`${JD_PATTERN.source}|${RESUME_PATTERN.source}`, "i");
const SUPPORTING_PATTERN = /参考|补充|结合看|一起看|顺便看|也看看|作为背景|supporting|context/i;
const SWITCH_PATTERN = /切换|换成|改用|用这份|用这个|使用这份|使用这个|绑定到|switch|change to/i;
const RESTART_PATTERN = /重新开始|重开|新开|另开|从头|restart|new interview|start over/i;
const NEGATED_RESTART_PATTERN = /(?:别|不要|不用|不必|先别|暂时别|先不|暂不).{0,8}(?:重新开始|重开|新开|另开|restart|start over)/i;
const AMBIGUOUS_OTHER_PATTERN = /另一个|另一份|别的|其他|另外|新的|other|another/i;
const EXPLICIT_ID_PATTERN = /#?\d{1,6}|「[^」]{2,80}」|"[^"]{2,80}"|《[^》]{2,80}》|[\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9\s·_-]{2,80}/;

function materialKind(text: string): InterviewMaterialKind {
  const hasJd = JD_PATTERN.test(text);
  const hasResume = RESUME_PATTERN.test(text);
  if (hasJd && !hasResume) return "jd";
  if (hasResume && !hasJd) return "resume";
  return "unknown";
}

function cleanQuery(text: string): string {
  return text
    .replace(/^(请|麻烦|帮我|你先|现在|然后|接下来|把|用|切换|换成|改用|参考|结合|重新开始|重开)+/g, "")
    .replace(/(这个|这份|那个|那份|材料|作为背景|做面试|模拟面试|面试|吧|一下|看看|来练)+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function hasNamedTarget(text: string): boolean {
  const withoutGeneric = cleanQuery(text)
    .replace(MATERIAL_PATTERN, "")
    .replace(AMBIGUOUS_OTHER_PATTERN, "")
    .trim();
  return EXPLICIT_ID_PATTERN.test(withoutGeneric) && withoutGeneric.length >= 2;
}

export function classifyInterviewMaterialReference(text: string): InterviewMaterialReferenceDecision {
  const normalized = text.trim();
  const kind = materialKind(normalized);
  const mentionsMaterial = MATERIAL_PATTERN.test(normalized);
  if (!mentionsMaterial) {
    return {
      intent: "continue_current_session",
      materialKind: "unknown",
      confidence: "high",
      explicit: false,
      query: "",
      reason: "No JD or resume reference was detected.",
    };
  }

  const wantsRestart = RESTART_PATTERN.test(normalized) && !NEGATED_RESTART_PATTERN.test(normalized);
  const wantsSwitch = SWITCH_PATTERN.test(normalized);
  const wantsSupport = SUPPORTING_PATTERN.test(normalized);
  const ambiguousOther = AMBIGUOUS_OTHER_PATTERN.test(normalized);
  const namedTarget = hasNamedTarget(normalized);
  const query = cleanQuery(normalized);

  if ((wantsRestart || wantsSwitch) && namedTarget && wantsRestart) {
    return {
      intent: "restart_as_new_interview",
      materialKind: kind,
      confidence: "high",
      explicit: true,
      query,
      reason: "The user explicitly asked to switch material and restart.",
    };
  }

  if (wantsSwitch && namedTarget) {
    return {
      intent: "switch_active_material",
      materialKind: kind,
      confidence: "high",
      explicit: true,
      query,
      reason: "The user explicitly named material to switch to.",
    };
  }

  if (wantsSupport) {
    return {
      intent: "use_as_supporting_context",
      materialKind: kind,
      confidence: namedTarget ? "high" : "medium",
      explicit: namedTarget,
      query,
      reason: "The user framed the material as additional context.",
    };
  }

  if ((wantsSwitch || wantsRestart || ambiguousOther) && !namedTarget) {
    return {
      intent: "needs_clarification",
      materialKind: kind,
      confidence: "medium",
      explicit: false,
      query,
      reason: "The user referenced another material without a matchable name or id.",
    };
  }

  return {
    intent: "use_as_supporting_context",
    materialKind: kind,
    confidence: "low",
    explicit: false,
    query,
    reason: "The material mention is weak, so it should not silently change the active binding.",
  };
}
