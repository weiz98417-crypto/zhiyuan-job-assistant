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

export interface InterviewMaterialRecord {
  id?: string | number;
  kind: Exclude<InterviewMaterialKind, "unknown">;
  title?: string;
  name?: string;
  label?: string;
  company?: string;
  role?: string;
  body?: string;
  keywords?: string[];
}

export interface InterviewMaterialMatch {
  record: InterviewMaterialRecord;
  score: number;
  confidence: "high" | "medium" | "low";
  matchedBy: string[];
}

export type InterviewRebindAction =
  | "continue_current_session"
  | "use_as_supporting_context"
  | "auto_switch_material"
  | "auto_restart_interview"
  | "ask_clarification"
  | "keep_current_binding";

export interface InterviewRebindResolution {
  action: InterviewRebindAction;
  materialKind: InterviewMaterialKind;
  match?: InterviewMaterialMatch;
  clarificationQuestion?: string;
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

function normalizeForMatch(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[「」《》"'#，。；;:：、/\\|()[\]{}_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalizeForMatch(query)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function confidenceForScore(score: number): InterviewMaterialMatch["confidence"] {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function matchInterviewMaterialReference(
  decision: InterviewMaterialReferenceDecision,
  records: InterviewMaterialRecord[],
): InterviewMaterialMatch | null {
  if (decision.intent === "continue_current_session") return null;
  const kindFiltered = decision.materialKind === "unknown"
    ? records
    : records.filter((record) => record.kind === decision.materialKind);
  const q = normalizeForMatch(decision.query);
  const tokens = queryTokens(decision.query);
  if (!q && tokens.length === 0) return null;

  const matches = kindFiltered.map((record): InterviewMaterialMatch => {
    const matchedBy: string[] = [];
    let score = 0;
    const id = record.id == null ? "" : String(record.id);
    const idPatterns = [`#${id}`, `id ${id}`, `id=${id}`, id].filter(Boolean).map(normalizeForMatch);
    if (id && idPatterns.some((pattern) => q === pattern || q.includes(pattern))) {
      score += 90;
      matchedBy.push("id");
    }

    const title = normalizeForMatch(record.title || record.name || record.label);
    if (title && (q.includes(title) || title.includes(q))) {
      score += 70;
      matchedBy.push("title");
    }

    const company = normalizeForMatch(record.company);
    const role = normalizeForMatch(record.role);
    if (company && q.includes(company)) {
      score += 35;
      matchedBy.push("company");
    }
    if (role && q.includes(role)) {
      score += 35;
      matchedBy.push("role");
    }
    if (company && role && q.includes(company) && q.includes(role)) {
      score += 20;
      matchedBy.push("company_role_pair");
    }

    const keywordHits = (record.keywords || [])
      .map(normalizeForMatch)
      .filter((keyword) => keyword && tokens.some((token) => keyword.includes(token) || token.includes(keyword)));
    if (keywordHits.length) {
      score += Math.min(30, keywordHits.length * 10);
      matchedBy.push("keywords");
    }

    const body = normalizeForMatch(record.body).slice(0, 1200);
    const bodyHits = tokens.filter((token) => body.includes(token)).length;
    if (bodyHits >= 2) {
      score += Math.min(20, bodyHits * 4);
      matchedBy.push("body");
    }

    return {
      record,
      score,
      confidence: confidenceForScore(score),
      matchedBy: Array.from(new Set(matchedBy)),
    };
  }).sort((a, b) => b.score - a.score);

  const best = matches[0];
  if (!best || best.score < 20) return null;
  return best;
}

function materialLabel(kind: InterviewMaterialKind): string {
  if (kind === "jd") return "JD";
  if (kind === "resume") return "简历";
  return "材料";
}

export function resolveInterviewRebindAction(
  decision: InterviewMaterialReferenceDecision,
  match: InterviewMaterialMatch | null,
): InterviewRebindResolution {
  if (decision.intent === "continue_current_session") {
    return {
      action: "continue_current_session",
      materialKind: decision.materialKind,
      reason: "No material reference needs arbitration.",
    };
  }

  if (decision.intent === "use_as_supporting_context") {
    return {
      action: "use_as_supporting_context",
      materialKind: decision.materialKind,
      match: match || undefined,
      reason: "The user framed the material as context rather than a binding switch.",
    };
  }

  const highConfidenceExplicit =
    decision.explicit &&
    decision.confidence === "high" &&
    match?.confidence === "high";

  if (highConfidenceExplicit && decision.intent === "restart_as_new_interview") {
    return {
      action: "auto_restart_interview",
      materialKind: decision.materialKind,
      match,
      reason: "Explicit restart request with a high-confidence local match.",
    };
  }

  if (highConfidenceExplicit && decision.intent === "switch_active_material") {
    return {
      action: "auto_switch_material",
      materialKind: decision.materialKind,
      match,
      reason: "Explicit switch request with a high-confidence local match.",
    };
  }

  if (decision.confidence === "medium" || match?.confidence === "medium" || decision.intent === "needs_clarification") {
    return {
      action: "ask_clarification",
      materialKind: decision.materialKind,
      match: match || undefined,
      clarificationQuestion: `你是想切换到这份${materialLabel(decision.materialKind)}重新面试，还是只把它作为补充参考？`,
      reason: "The reference is plausible but not safe enough for a silent switch.",
    };
  }

  return {
    action: "keep_current_binding",
    materialKind: decision.materialKind,
    match: match || undefined,
    reason: "The material reference is weak or unmatched, so the active binding should remain unchanged.",
  };
}

export function formatInterviewRebindRuntimeDirective(resolution: InterviewRebindResolution): string {
  const matched = resolution.match?.record;
  const matchedLabel = matched
    ? `${matched.kind} #${String(matched.id || "unknown")} ${matched.title || matched.name || matched.company || ""} ${matched.role || ""}`.trim()
    : "none";
  return [
    "## Interview Material Rebind Arbitration",
    `Action: ${resolution.action}`,
    `Material kind: ${resolution.materialKind}`,
    `Matched local record: ${matchedLabel}`,
    `Reason: ${resolution.reason}`,
    resolution.clarificationQuestion ? `Clarification question: ${resolution.clarificationQuestion}` : "",
    "",
    "Rules:",
    "- Read-only JD/resume tools remain allowed for context: get_recent_jd_context, read_file, get_reference_detail.",
    "- Do not change the active interview binding unless Action is auto_switch_material or auto_restart_interview.",
    "- If Action is ask_clarification, ask exactly the clarification question and stop.",
    "- If Action is use_as_supporting_context or keep_current_binding, keep the current planSnapshot as the source of truth.",
  ].filter(Boolean).join("\n");
}
