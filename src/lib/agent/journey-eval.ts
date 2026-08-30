import type { AgentTaskType } from "@/lib/agent/task-contract";
import { generateBoundedTaskPaths, TASK_JOURNEY_GRAPH_VERSION, type AgentArtifactRef } from "@/lib/agent/task-journey";
import { stableContentHash } from "@/lib/agent/verified-action";

export interface DeterministicJourneyFixture {
  fixtureId: string;
  version: string;
  startTask: AgentTaskType;
  prompt: string;
  expected: {
    taskPath: AgentTaskType[];
    requiredArtifactKinds?: string[];
    hardGates?: string[];
    forbiddenUserText?: string[];
  };
  facts: Record<string, unknown>;
}

export interface JourneyEvalRecord {
  fixtureId: string;
  fixtureVersion: string;
  graphVersion: string;
  path: AgentTaskType[];
  fixtureHash: string;
  gates: Record<string, "passed" | "failed">;
  failures: string[];
  hardGatePassed: boolean;
  status: "passed" | "failed";
  evidence: { artifactRefs: AgentArtifactRef[]; userText: string };
}

export interface DeterministicJourneyAdapter {
  start(input: {
    fixture: DeterministicJourneyFixture;
    taskType: AgentTaskType;
    prompt: string;
    facts: Record<string, unknown>;
  }): Promise<{ runId: string }>;
  transition(input: {
    runId: string;
    from: AgentTaskType;
    to: AgentTaskType;
    artifacts: AgentArtifactRef[];
  }): Promise<{ runId: string; artifactRefs?: AgentArtifactRef[] }>;
  waitForTerminal(input: { runId: string }): Promise<{
    status: "succeeded" | "failed" | "waiting_user";
    artifactRefs?: AgentArtifactRef[];
    userText?: string;
    gates?: Partial<Record<string, boolean>>;
    failureEvidence?: string[];
  }>;
  recover?(input: { runId: string; kind: "pause" | "switch" | "cancel" | "refresh" | "worker_recovery" }): Promise<void>;
}

export function createJDResumeVerticalFixture(): DeterministicJourneyFixture {
  return {
    fixtureId: "jd-resume-vertical-001",
    version: "v1",
    startTask: "jd_evaluation",
    prompt: "分析这份 JD，并根据结果诊断我的简历，提出修改提案，等我批准后再应用。",
    expected: {
      taskPath: ["jd_evaluation", "resume_query", "resume_edit"],
      requiredArtifactKinds: ["jd", "report", "resume", "draft"],
      hardGates: ["owner_scope", "artifact_not_stale", "scoped_user_approval", "read_back_required"],
      forbiddenUserText: ["自我定位引导完成", "system prompt", "chain-of-thought"],
    },
    facts: {
      jd: { id: "jd-fixture-1", version: "v1", body: "负责 AI 产品规划、用户研究与 Agent 落地，要求三年产品经验。" },
      resume: { id: "resume-fixture-1", version: "v3", sections: { experience: "负责求职产品设计并推动核心流程上线。" } },
      proposedResume: { section: "experience", content: "负责 AI 求职产品设计，推动核心流程上线并提升交付效率。" },
    },
  };
}

export function evaluateDeterministicJourney(input: {
  fixture: DeterministicJourneyFixture;
  path: AgentTaskType[];
  artifactRefs?: AgentArtifactRef[];
  userText?: string;
  gates?: Partial<Record<string, boolean>>;
  failureEvidence?: string[];
}): JourneyEvalRecord {
  const failures: string[] = [];
  const expectedPath = input.fixture.expected.taskPath;
  if (input.path.join(">") !== expectedPath.join(">")) failures.push("invalid_task_path");
  const refs = input.artifactRefs || [];
  for (const kind of input.fixture.expected.requiredArtifactKinds || []) {
    if (!refs.some((ref) => ref.kind === kind && !ref.stale)) failures.push(`missing_artifact:${kind}`);
  }
  const userText = input.userText || "";
  for (const forbidden of input.fixture.expected.forbiddenUserText || []) {
    if (userText.toLowerCase().includes(forbidden.toLowerCase())) failures.push(`user_leakage:${forbidden}`);
  }
  const hardGates = input.fixture.expected.hardGates || [];
  const gates = Object.fromEntries(hardGates.map((gate) => {
    const observed = input.gates?.[gate];
    const failed = observed === false || failures.some((failure) => failure.includes(gate));
    return [gate, failed ? "failed" : "passed"];
  })) as JourneyEvalRecord["gates"];
  const allFailures = [...failures, ...(input.failureEvidence || [])];
  const hardGatePassed = Object.values(gates).every((status) => status === "passed");
  return {
    fixtureId: input.fixture.fixtureId,
    fixtureVersion: input.fixture.version,
    graphVersion: TASK_JOURNEY_GRAPH_VERSION,
    path: [...input.path],
    fixtureHash: stableContentHash(input.fixture),
    gates,
    failures: Array.from(new Set(allFailures)),
    hardGatePassed,
    status: hardGatePassed && allFailures.length === 0 ? "passed" : "failed",
    evidence: { artifactRefs: refs.map((ref) => ({ ...ref })), userText },
  };
}

export async function runDeterministicJourney(input: {
  fixture: DeterministicJourneyFixture;
  adapter: DeterministicJourneyAdapter;
  path?: AgentTaskType[];
  interruptions?: Array<"pause" | "switch" | "cancel" | "refresh" | "worker_recovery">;
}): Promise<JourneyEvalRecord> {
  const path = input.path || input.fixture.expected.taskPath;
  const first = await input.adapter.start({
    fixture: input.fixture,
    taskType: input.fixture.startTask,
    prompt: input.fixture.prompt,
    facts: input.fixture.facts,
  });
  let runId = first.runId;
  let refs: AgentArtifactRef[] = [];
  for (const kind of input.interruptions || []) {
    await input.adapter.recover?.({ runId, kind });
  }
  for (let index = 1; index < path.length; index += 1) {
    const transition = await input.adapter.transition({
      runId,
      from: path[index - 1],
      to: path[index],
      artifacts: refs,
    });
    runId = transition.runId;
    refs = mergeArtifactRefs(refs, transition.artifactRefs || []);
  }
  const terminal = await input.adapter.waitForTerminal({ runId });
  refs = mergeArtifactRefs(refs, terminal.artifactRefs || []);
  return evaluateDeterministicJourney({
    fixture: input.fixture,
    path,
    artifactRefs: refs,
    userText: terminal.userText,
    gates: terminal.gates,
    failureEvidence: [
      ...(terminal.status === "failed" ? ["runtime_terminal_failed"] : []),
      ...(terminal.status === "waiting_user" ? ["runtime_waiting_user"] : []),
      ...(terminal.failureEvidence || []),
    ],
  });
}

export function listDeterministicJourneyPaths(maxDepth = 2): AgentTaskType[][] {
  return generateBoundedTaskPaths({ maxDepth });
}

function mergeArtifactRefs(left: AgentArtifactRef[], right: AgentArtifactRef[]): AgentArtifactRef[] {
  const byKey = new Map<string, AgentArtifactRef>();
  for (const ref of [...left, ...right]) byKey.set(`${ref.kind}:${ref.artifactId}:${ref.version}`, { ...ref });
  return Array.from(byKey.values());
}
