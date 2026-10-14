import { createHash } from "node:crypto";

export const QUALITY_POLICY_VERSION = "spec40-task-risk-v1";

export const TASK_QUALITY_PLANS = Object.freeze({
  general_chat: Object.freeze({ risk: "supporting", minimumScore: 0.75, rubricVersion: "chat-actionability-v1" }),
  career_positioning_guidance: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "positioning-evidence-v1" }),
  resume_query: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "resume-source-v1" }),
  resume_diagnosis: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "resume-diagnosis-v1" }),
  resume_edit: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "resume-edit-fidelity-v1" }),
  jd_evaluation: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "jd-decision-v1" }),
  offer_evaluation: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "offer-decision-v1" }),
  interview_coaching: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "interview-binding-v1" }),
  profile_update: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "profile-evidence-v1" }),
  reference_resume_save: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "reference-source-v1" }),
  file_export: Object.freeze({ risk: "critical", minimumScore: 0.8, rubricVersion: "export-source-v1" }),
  job_search: Object.freeze({ risk: "supporting", minimumScore: 0.75, rubricVersion: "job-search-relevance-v1" }),
  job_digest: Object.freeze({ risk: "supporting", minimumScore: 0.75, rubricVersion: "job-digest-relevance-v1" }),
});

export const SINGLE_TURN_TASKS = Object.freeze(Object.keys(TASK_QUALITY_PLANS).filter((task) => task !== "job_digest"));

export const REQUIRED_CASE_TASKS = Object.freeze({
  "AC-OFR": Object.freeze(["offer_evaluation"]),
  "PG-OFFER": Object.freeze(["offer_evaluation"]),
  "AC-INT": Object.freeze(["interview_coaching"]),
  "PG-IV": Object.freeze(["interview_coaching"]),
  "AC-POS": Object.freeze(["career_positioning_guidance"]),
});

export const QUALITY_POLICY_HASH = createHash("sha256").update(JSON.stringify({
  version: QUALITY_POLICY_VERSION, tasks: TASK_QUALITY_PLANS,
  singleTurnTasks: SINGLE_TURN_TASKS, requiredCaseTasks: REQUIRED_CASE_TASKS,
})).digest("hex");
