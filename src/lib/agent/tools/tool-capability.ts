import type { ToolGovernance } from "@/lib/agent/tool-governance";
import type { ToolCapability } from "@/lib/agent/tools/types";

const BACKGROUND_TOOLS = new Set([
  "evaluate_jd_full",
  "scan_portals",
  "download_report_pdf",
  "export_file",
]);

const SERVER_EXECUTION_TOOLS = new Set([
  "search_applications",
  "get_pipeline_status",
  "get_profile",
  "get_recent_activity",
  "get_recent_jd_context",
  "get_reference_detail",
  "get_application_context",
  "check_pipeline_health",
  "detect_skill_gaps",
  "get_profile_insights",
  "get_recommendations",
  "analyze_jd_risks",
  "decode_black_market_terms",
  "fetch_jd_content",
  "check_ats_compatibility",
  "evaluate_offer",
  "compare_offers_deep",
  "generate_offer_negotiation_strategy",
  "generate_offer_hr_question_list",
  "evaluate_jd",
  "self_positioning",
  "prepare_interview_full",
  "generate_interview_questions",
  "score_interview_answer",
  "start_interview_session",
  "mine_profile",
  "save_resume_section",
  "optimize_resume_section",
  "import_resume",
  "save_reference_resume",
  "generate_cv",
  "get_report_detail",
  "read_file",
  "read_offer_report",
  "create_resume_edit_proposal",
  "apply_resume_edit_proposal",
  "discard_resume_edit_proposal",
  "rollback_resume_edit_proposal",
  "update_report_metadata",
  "track_application",
  "update_application_status",
  "check_health",
  "web_search",
  "get_weather",
  "search_place",
  "get_directions",
  "search_jobs",
]);

const WORKER_BACKGROUND_TOOLS = new Set([
  "evaluate_jd_full",
  "scan_portals",
  "export_file",
  "download_report_pdf",
]);

export function deriveToolCapability(
  toolName: string,
  governance?: ToolGovernance,
): ToolCapability | undefined {
  if (!governance) return undefined;
  const backgroundCapable = BACKGROUND_TOOLS.has(toolName);
  const isRead = governance.effect === "read" || governance.effect === "guide";
  const isHighRisk = governance.effect === "high_risk_write" || governance.effect === "admin";
  return {
    risk: isHighRisk ? "high" : isRead ? "low" : "medium",
    deadlineClass: backgroundCapable ? "background" : isRead ? "foreground_read" : "verified_write",
    deadlineMs: backgroundCapable ? 5 * 60_000 : isRead ? 30_000 : 60_000,
    cancellation: isRead ? "cooperative" : "after_dispatch_reconcile",
    idempotency: isRead ? "none" : "request_key",
    reconciliation: governance.requiresReadBack ? "read_back" : isRead ? "none" : "manual",
    verification: governance.requiresReadBack ? "read_back" : "none",
    backgroundCapable,
    workerExecution: backgroundCapable
      ? WORKER_BACKGROUND_TOOLS.has(toolName) ? "background" : "legacy"
      : SERVER_EXECUTION_TOOLS.has(toolName) ? "server" : "legacy",
  };
}

export function hasCompleteToolCapability(capability?: ToolCapability): capability is ToolCapability {
  return Boolean(
    capability
    && capability.deadlineMs > 0
    && capability.risk
    && capability.deadlineClass
    && capability.cancellation
    && capability.idempotency
    && capability.reconciliation
    && capability.verification
    && capability.workerExecution,
  );
}
