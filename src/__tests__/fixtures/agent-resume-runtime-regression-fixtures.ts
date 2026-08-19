export const RESUME_RUNTIME_INCIDENT_20260717 = {
  id: "agent-resume-20260717-named-read-and-premature-contract-failure",
  source: "production_agent_run_replay",
  readRequest: "读一下候选人甲的简历",
  readToolCalls: [
    { path: "我的简历" },
    { path: "候选人甲的简历", offset: 1600 },
  ],
  optimizeRequest: "帮我优化一下简历",
  observed: {
    firstReadSucceeded: true,
    namedContinuationFellThroughToFilesystem: true,
    finalReadRunStatus: "failed",
    optimizationReadSucceeded: true,
    optimizationDraftGenerated: false,
    finalOptimizationRunStatus: "failed",
  },
  expected: {
    namedContinuationResource: "cv",
    completedReadStatus: "succeeded",
    initialOptimizationTool: "optimize_resume_section",
    draftStatus: "waiting_user",
    cvWriteBeforeApproval: false,
  },
} as const;
