import type { AgentTaskType } from "@/lib/agent/task-contract";

export const STAGING_JUDGE_VERSION = "rubric-v1";
export const STAGING_THRESHOLD_VERSION = "thresholds-v1";

export interface StagingJudgeInput {
  taskType: AgentTaskType;
  output: string;
  expectedFacts?: string[];
  deterministicFailures?: string[];
  hardVetoes?: string[];
  rubricVersion?: string;
}

export interface StagingJudgeResult {
  judgeVersion: string;
  thresholdVersion: string;
  dimensions: Record<string, number>;
  score: number;
  hardVetoes: string[];
  releaseAllowed: boolean;
  thresholdProposal: { minimumScore: number; sampleSize: number; status: "proposal" };
  evidence: string[];
}

const COMMON_DIMENSIONS = ["factuality", "completeness", "relevance", "actionability", "riskDisclosure"];
const TASK_DIMENSIONS: Partial<Record<AgentTaskType, string[]>> = {
  jd_evaluation: ["jdSpecificity", "riskDisclosure"],
  resume_query: ["roleRelevance", "nonFabrication"],
  resume_edit: ["roleRelevance", "improvement", "nonFabrication"],
  offer_evaluation: ["missingInformation", "clauseFidelity", "decisionUsefulness"],
};

const HARD_VETO_PATTERNS = [
  /permission|owner.?scope|tool.?policy|read.?back|stale.?artifact|protocol.?leak|empty.?visible|fabricat/i,
];

export function listStagingRubricDimensions(taskType: AgentTaskType): string[] {
  return Array.from(new Set([...COMMON_DIMENSIONS, ...(TASK_DIMENSIONS[taskType] || [])]));
}

export function judgeStagingOutput(input: StagingJudgeInput): StagingJudgeResult {
  const output = input.output.trim();
  const dimensions = Object.fromEntries(listStagingRubricDimensions(input.taskType).map((dimension) => [dimension, scoreDimension(dimension, output, input.expectedFacts || [])]));
  const scores = Object.values(dimensions);
  const score = scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(3)) : 0;
  const hardVetoes = Array.from(new Set([
    ...(input.deterministicFailures || []),
    ...(input.hardVetoes || []),
  ].filter((failure) => HARD_VETO_PATTERNS.some((pattern) => pattern.test(failure)))));
  const evidence = [
    ...(output ? ["output_present"] : ["empty_output"]),
    ...(input.expectedFacts || []).filter((fact) => output.toLowerCase().includes(fact.toLowerCase())).map((fact) => `fact_present:${fact}`),
  ];
  const minimumScore = thresholdFor(input.taskType);
  return {
    judgeVersion: input.rubricVersion || STAGING_JUDGE_VERSION,
    thresholdVersion: STAGING_THRESHOLD_VERSION,
    dimensions,
    score,
    hardVetoes,
    releaseAllowed: hardVetoes.length === 0 && score >= minimumScore,
    thresholdProposal: { minimumScore, sampleSize: 0, status: "proposal" },
    evidence,
  };
}

function scoreDimension(dimension: string, output: string, expectedFacts: string[]): number {
  if (!output) return 0;
  const factCoverage = expectedFacts.length === 0
    ? 1
    : expectedFacts.filter((fact) => output.toLowerCase().includes(fact.toLowerCase())).length / expectedFacts.length;
  if (dimension === "riskDisclosure" || dimension === "missingInformation") {
    return /风险|缺失|需要确认|不确定|risk|missing|unknown/i.test(output) ? 1 : 0.5;
  }
  if (dimension === "actionability" || dimension === "decisionUsefulness" || dimension === "improvement") {
    return /建议|下一步|修改|行动|recommend|next|improv/i.test(output) ? 1 : 0.5;
  }
  if (dimension === "nonFabrication" || dimension === "clauseFidelity") {
    return /虚构|原文|依据|事实|source|evidence|clause/i.test(output) ? 1 : 0.5;
  }
  return Math.max(0.25, Math.min(1, factCoverage || 0.5));
}

function thresholdFor(taskType: AgentTaskType): number {
  return taskType === "resume_edit" || taskType === "offer_evaluation" ? 0.8 : 0.75;
}
