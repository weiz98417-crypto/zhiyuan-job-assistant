import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getStagePrompt, type SOPState } from "@/lib/agent/profile-sop";
import { getDataRepositories } from "@/lib/data-repositories";

const SOP_FIELD = "_agentPositioningSop";
const SOP_TTL_MS = 24 * 60 * 60 * 1000;

export interface ProfileSopInput {
  action: string;
  answer?: string;
}

export async function runProfileSop(
  principal: ExecutionPrincipal,
  input: ProfileSopInput,
): Promise<Record<string, unknown> & { readBackVerified: true }> {
  const repositories = getDataRepositories();
  const existing = await repositories.profiles.get(principal.userId);
  const goals = parseObject(existing?.goals_json);
  let state = parseSop(goals[SOP_FIELD]);
  if (state && Date.now() - new Date(state.updatedAt).getTime() > SOP_TTL_MS) state = null;
  const action = input.action || "start";

  if (action === "start" || action === "stage_prompt") {
    const alreadyStarted = Boolean(state);
    state ||= newSopState();
    goals[SOP_FIELD] = state;
    await persistProfileState(principal, goals, existing);
    return {
      stage: state.stage,
      branch: state.branch || null,
      prompt: getStagePrompt(state.stage, state.branch),
      isResume: alreadyStarted && state.stage > 0,
      alreadyStarted,
      collected: state.collected,
      hasGoals: Object.keys(goals).some((key) => key !== SOP_FIELD),
      readBackVerified: true,
    };
  }

  if (action === "answer") {
    const answer = String(input.answer || "").trim();
    if (!answer) throw new Error("请提供你的回答");
    state ||= newSopState();
    advanceSop(state, answer);
    if (state.stage === 5) {
      delete goals[SOP_FIELD];
      goals.positioningResponses = state.collected;
      goals.confirmedAt = new Date().toISOString();
      await persistProfileState(principal, goals, existing);
      return {
        stage: 5,
        done: true,
        summary: "画像已生成！可在 /profile 页面查看求职画像和进化轨迹。",
        readBackVerified: true,
      };
    }
    goals[SOP_FIELD] = state;
    await persistProfileState(principal, goals, existing);
    return {
      stage: state.stage,
      branch: state.branch || null,
      prompt: getStagePrompt(state.stage, state.branch),
      collected: state.collected,
      readBackVerified: true,
    };
  }

  if (action === "complete") {
    if (state) {
      delete goals[SOP_FIELD];
      goals.positioningResponses = state.collected;
      goals.confirmedAt = new Date().toISOString();
      await persistProfileState(principal, goals, existing);
      const prior = await repositories.signals.query({
        source: "dingwei",
        signal_type: "role_preference",
        limit: 50,
      }, principal.userId);
      const alreadyRecorded = prior.some((row) => parseObject(row.content_json).sopStartedAt === state?.startedAt);
      if (!alreadyRecorded) {
        await repositories.signals.insert({
          source: "dingwei",
          signal_type: "role_preference",
          content_json: JSON.stringify({ data: state.collected, branch: state.branch, sopStartedAt: state.startedAt }),
          session_id: undefined,
        }, principal.userId);
      }
    } else {
      await persistProfileState(principal, goals, existing);
    }
    return { done: true, summary: "定位已保存！画像已更新。可在 /profile 页面查看。", readBackVerified: true };
  }

  if (action === "reset") {
    delete goals[SOP_FIELD];
    await persistProfileState(principal, goals, existing);
    return { reset: true, readBackVerified: true };
  }

  throw new Error(`Unknown action: ${action}`);
}

async function persistProfileState(
  principal: ExecutionPrincipal,
  goals: Record<string, unknown>,
  existing: { data_json: string; history_json: string } | undefined,
): Promise<void> {
  const repositories = getDataRepositories();
  await repositories.profiles.upsert(
    principal.userId,
    existing?.data_json || "{}",
    existing?.history_json || "[]",
    JSON.stringify(goals),
  );
  const readBack = await repositories.profiles.get(principal.userId);
  if (canonicalJson(parseObject(readBack?.goals_json)) !== canonicalJson(goals)) {
    throw new Error("画像 SOP 持久化后读回校验失败");
  }
}

function advanceSop(state: SOPState, answer: string): void {
  if (state.stage === 0) {
    if (/A|在找|投简历|在投/.test(answer)) state.branch = "A";
    else if (/C|应届|在校|完全没方向|没方向/.test(answer)) state.branch = "C";
    else if (/D|纠结|几个方向|比较/.test(answer)) state.branch = "D";
    else state.branch = "B";
  }
  if (state.stage === 4) {
    if (/确认|可以|没问题|是的|^对$|^行$|^好$/.test(answer)) state.stage = 5;
  } else {
    state.collected[`stage_${state.stage}`] = answer;
    if (state.stage < 4) state.stage += 1;
  }
  state.updatedAt = new Date().toISOString();
}

function newSopState(): SOPState {
  const now = new Date().toISOString();
  return { stage: 0, collected: {}, startedAt: now, updatedAt: now };
}

function parseSop(value: unknown): SOPState | null {
  const state = parseObject(value);
  const stage = Number(state.stage);
  if (!Number.isInteger(stage) || stage < 0 || stage > 5) return null;
  return {
    stage,
    branch: ["A", "B", "C", "D"].includes(String(state.branch)) ? state.branch as SOPState["branch"] : undefined,
    collected: Object.fromEntries(Object.entries(parseObject(state.collected)).map(([key, item]) => [key, String(item)])),
    startedAt: String(state.startedAt || new Date().toISOString()),
    updatedAt: String(state.updatedAt || new Date().toISOString()),
  };
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(canonicalJson(item))));
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const sorted = Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = JSON.parse(canonicalJson((value as Record<string, unknown>)[key]));
    return result;
  }, {});
  return JSON.stringify(sorted);
}
