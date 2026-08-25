import { describe, expect, it } from "vitest";
import registry from "@/lib/agent/tools";
import { getAllAgents } from "@/lib/agent/registry";

describe("Worker tool exposure", () => {
  it("exposes only tools migrated to principal-scoped server execution", () => {
    const names = registry.toOpenAITools(undefined, true).map((tool) => tool.function.name);

    expect(names).toEqual(expect.arrayContaining([
      "search_applications",
      "get_pipeline_status",
      "get_profile",
      "get_recent_activity",
      "get_recent_jd_context",
      "get_reference_detail",
      "get_application_context",
      "get_report_detail",
      "read_file",
      "read_offer_report",
      "track_application",
      "update_application_status",
      "scan_portals",
      "export_file",
      "download_report_pdf",
      "evaluate_jd_full",
      "create_resume_edit_proposal",
      "apply_resume_edit_proposal",
      "discard_resume_edit_proposal",
      "rollback_resume_edit_proposal",
      "update_report_metadata",
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
      "check_health",
      "web_search",
      "get_weather",
      "search_place",
      "get_directions",
      "search_jobs",
    ]));
  });

  it("keeps every Agent allowlist executable in worker_all mode", () => {
    const workerNames = new Set(
      registry.toOpenAITools(undefined, true).map((tool) => tool.function.name),
    );

    expect(registry.getAll().filter((tool) => tool.capability?.workerExecution === "legacy")).toEqual([]);
    for (const agent of getAllAgents()) {
      const allowlist = agent.toolNames.length
        ? agent.toolNames
        : registry.getAll().map((tool) => tool.name);
      expect({
        agent: agent.id,
        unavailable: allowlist.filter((toolName) => !workerNames.has(toolName)),
      }).toEqual({ agent: agent.id, unavailable: [] });
    }
  });
});
