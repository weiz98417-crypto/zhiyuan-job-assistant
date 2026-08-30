import type { AgentTaskType } from "@/lib/agent/task-contract";

export const AGENT_E2E_TASK_TYPES: readonly AgentTaskType[] = [
  "general_chat",
  "career_positioning_guidance",
  "resume_query",
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "job_search",
];

export const AGENT_E2E_FLOW_IDS = [
  "short_input",
  "long_input",
  "continuous_three_turns",
  "pause_resume",
  "cancel",
  "waiting_user_input",
  "approval",
  "denial",
  "transient_failure",
  "permanent_failure",
  "timeout",
  "service_recovery",
  "sse_loss_polling_recovery",
  "refresh_recovery",
  "resume_read_draft_proposal_approval_apply_readback",
  "interview_jd_selection",
] as const;

export type AgentE2EFlowId = (typeof AGENT_E2E_FLOW_IDS)[number];

export interface AgentE2EScenario {
  taskType: AgentTaskType;
  flowIds: readonly AgentE2EFlowId[];
}

export const AGENT_E2E_MATRIX: readonly AgentE2EScenario[] = AGENT_E2E_TASK_TYPES.map((taskType) => ({
  taskType,
  flowIds: AGENT_E2E_FLOW_IDS,
}));

export const AGENT_E2E_REGRESSION_FILES = [
  "src/__tests__/agent-task-runtime.e2e.test.ts",
  "src/__tests__/agent-feature-shapes.e2e.test.ts",
  "src/__tests__/agent-resume-approval.regression-2.test.ts",
  "src/__tests__/agent-artifact-card-ui.regression-1.test.ts",
  "src/__tests__/agent-activity-track-size.regression-1.test.ts",
  "src/__tests__/agent-terminal-run-toolbar.regression-1.test.ts",
  "src/__tests__/agent-hidden-bootstrap-route.regression-1.test.ts",
  "src/__tests__/agent-e2e-suite-coverage.regression-1.test.ts",
  "src/__tests__/agent-live-session-readback.regression-1.test.ts",
  "src/__tests__/agent-session-server-readback.regression-1.test.ts",
  "src/__tests__/durable-run-client.test.ts",
  "src/__tests__/durable-agent-runtime.test.ts",
  "src/__tests__/recovery-supervisor.test.ts",
  "src/__tests__/agent-runtime-regressions.eval.test.ts",
  "src/__tests__/agent-production-chain-regressions.eval.test.ts",
  "src/__tests__/interview-jd-selection.regression-1.test.ts",
] as const;
