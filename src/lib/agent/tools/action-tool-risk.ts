export type ActionToolRisk = "read-only" | "low-risk-write" | "high-risk-write" | "destructive-write";

export type DurableMutationTarget =
  | "cv"
  | "jd"
  | "report"
  | "offer"
  | "profile"
  | "memory"
  | "session"
  | "file"
  | "scan";

export interface ActionToolRiskRecord {
  toolName: string;
  risk: ActionToolRisk;
  targets: DurableMutationTarget[];
  summary: string;
  requiresVerifiedWrite: boolean;
}

export const ACTION_TOOL_RISK_AUDIT: ActionToolRiskRecord[] = [
  {
    toolName: "analyze_jd_risks",
    risk: "read-only",
    targets: [],
    summary: "Analyzes JD risk from supplied text without durable writes.",
    requiresVerifiedWrite: false,
  },
  {
    toolName: "check_health",
    risk: "read-only",
    targets: [],
    summary: "Runs diagnostic checks without mutating user data.",
    requiresVerifiedWrite: false,
  },
  {
    toolName: "compare_offers_deep",
    risk: "high-risk-write",
    targets: ["offer", "report"],
    summary: "May persist offer comparison output and derived report data.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "download_report_pdf",
    risk: "low-risk-write",
    targets: ["file"],
    summary: "Creates or downloads a report artifact; file existence and size should be verified.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "evaluate_jd",
    risk: "high-risk-write",
    targets: ["jd", "report", "profile"],
    summary: "Evaluates JD content and may persist JD/report/profile-derived records.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "evaluate_jd_full",
    risk: "high-risk-write",
    targets: ["jd", "report", "profile"],
    summary: "Runs full OCR/JD evaluation pipeline and persists report/JD artifacts.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "evaluate_offer",
    risk: "high-risk-write",
    targets: ["offer", "report", "profile", "memory"],
    summary: "Evaluates offer content and may persist offer records, reports, profile signals, or memory.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "export_file",
    risk: "low-risk-write",
    targets: ["file"],
    summary: "Exports a file artifact; success requires existence/size/hash evidence.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "fetch_jd_content",
    risk: "low-risk-write",
    targets: ["jd"],
    summary: "Fetches JD content and may hand it to later persistence flows.",
    requiresVerifiedWrite: false,
  },
  {
    toolName: "generate_cv",
    risk: "high-risk-write",
    targets: ["cv"],
    summary: "Generates CV content and may replace durable resume data.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "generate_interview_questions",
    risk: "read-only",
    targets: [],
    summary: "Generates the next interview question; no durable write expected.",
    requiresVerifiedWrite: false,
  },
  {
    toolName: "generate_offer_hr_question_list",
    risk: "high-risk-write",
    targets: ["offer", "report"],
    summary: "May update offer report modules with HR question guidance.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "generate_offer_negotiation_strategy",
    risk: "high-risk-write",
    targets: ["offer", "report"],
    summary: "May update offer report modules with negotiation guidance.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "import_resume",
    risk: "high-risk-write",
    targets: ["cv"],
    summary: "Imports resume content into the canonical CV store.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "mine_profile",
    risk: "high-risk-write",
    targets: ["profile", "memory"],
    summary: "Writes profile goals/signals based on user answers.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "optimize_resume_section",
    risk: "high-risk-write",
    targets: ["cv"],
    summary: "Optimizes a resume section and currently may sync CV cache/server state.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "prepare_interview_full",
    risk: "low-risk-write",
    targets: ["session"],
    summary: "Prepares interview state for a session; should not overwrite JD/CV source context silently.",
    requiresVerifiedWrite: false,
  },
  {
    toolName: "save_reference_resume",
    risk: "high-risk-write",
    targets: ["cv", "memory"],
    summary: "Persists excellent/reference resume material for future retrieval.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "save_resume_section",
    risk: "high-risk-write",
    targets: ["cv"],
    summary: "Writes a resume section into the canonical CV store.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "scan_portals",
    risk: "high-risk-write",
    targets: ["scan", "jd"],
    summary: "Enqueues or records job discovery scan state and discovered JD links.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "score_interview_answer",
    risk: "high-risk-write",
    targets: ["memory"],
    summary: "Scores an answer and writes candidate interview observations to memory.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "self_positioning",
    risk: "low-risk-write",
    targets: ["profile"],
    summary: "Creates positioning guidance that can feed profile updates.",
    requiresVerifiedWrite: false,
  },
  {
    toolName: "start_interview_session",
    risk: "high-risk-write",
    targets: ["session"],
    summary: "Starts or updates durable interview session state.",
    requiresVerifiedWrite: true,
  },
  {
    toolName: "update_report_metadata",
    risk: "high-risk-write",
    targets: ["report"],
    summary: "Mutates report metadata and must verify read-back state.",
    requiresVerifiedWrite: true,
  },
];

export function getActionToolRisk(toolName: string): ActionToolRiskRecord | undefined {
  return ACTION_TOOL_RISK_AUDIT.find((record) => record.toolName === toolName);
}

export function listHighRiskActionTools(): ActionToolRiskRecord[] {
  return ACTION_TOOL_RISK_AUDIT.filter((record) => record.risk === "high-risk-write");
}
