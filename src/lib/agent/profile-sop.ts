/* ── Profile Mining SOP State Manager ── */

const SOP_KEY = "zhiyuan-profile-sop-state";

export interface SOPState {
  stage: number; // 0-5 (0 = user state detection)
  branch?: "A" | "B" | "C" | "D"; // user state branch
  collected: Record<string, string>; // stage → answer
  startedAt: string;
  updatedAt: string;
}

export function initSOP(): SOPState {
  return {
    stage: 0,
    collected: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function loadSOP(): SOPState | null {
  try {
    const raw = localStorage.getItem(SOP_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SOPState;
    // Expire after 24h
    if (Date.now() - new Date(state.updatedAt).getTime() > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SOP_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function saveSOP(state: SOPState): void {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(SOP_KEY, JSON.stringify(state));
}

export function clearSOP(): void {
  localStorage.removeItem(SOP_KEY);
}

export function advanceStage(state: SOPState, answer: string): SOPState {
  // Stage 0: detect branch from answer
  if (state.stage === 0) {
    const a = answer.trim();
    if (a.includes("A") || a.includes("在找") || a.includes("投简历") || a.includes("在投")) state.branch = "A";
    else if (a.includes("C") || a.includes("应届") || a.includes("在校") || a.includes("完全没方向") || a.includes("没方向")) state.branch = "C";
    else if (a.includes("D") || a.includes("纠结") || a.includes("几个方向") || a.includes("比较")) state.branch = "D";
    else state.branch = "B";
  }

  // Stage 5: detect user confirmation of positioning card
  if (state.stage === 4) {
    const a = answer.trim();
    if (a.includes("确认") || a.includes("可以") || a.includes("对") || a.includes("行") || a.includes("好") || a.includes("没问题") || a.includes("是的")) {
      state.stage = 5; // Complete
    }
    // If user says "调整" or disagrees, stay at stage 4
  } else {
    state.collected[`stage_${state.stage}`] = answer;
    if (state.stage < 4) state.stage++;
  }
  saveSOP(state);
  return state;
}

export function getStagePrompt(stage: number, branch?: string): string {
  const prompts: Record<string, Record<number, string>> = {
    A: {
      0: "在开始之前，我想先了解一下——你现在更接近哪种情况？A. 已经在投简历找工作了 B. 还没开始找，想先搞清楚自己适合什么 C. 我是应届生或在校生 D. 有几个方向在纠结",
      1: "你最近投了哪些方向的岗位？哪个方向回应最多？有没有面试？",
      2: "投过的岗位里，哪个你觉得最接近理想？为什么？或者有没有投了之后后悔的？",
      3: "你的背景在这些方向里，最有竞争力的是哪个？能举个具体例子吗？",
      4: "信息收集得差不多了。准备给你输出定位卡——在这之前，有没有哪个方向你想试但还没投的？",
    },
    B: {
      0: "在开始之前，我想先了解一下——你现在更接近哪种情况？A. 已经在投简历找工作了 B. 还没开始找，想先搞清楚自己适合什么 C. 我是应届生或在校生 D. 有几个方向在纠结",
      1: "你说的方向，具体想做哪个细分？比如产品经理还分B端/C端、AI/传统、大厂/创业公司。",
      2: "你之前做过跟这个方向相关的事情吗？具体是什么？或者你觉得自己最缺什么？",
      3: "这个方向的市场需求怎么样？你想做的具体岗位名叫什么？",
      4: "信息收集得差不多了。准备给你输出定位卡——你对这个方向的薪资和工作方式有什么期待？",
    },
    C: {
      0: "在开始之前，我想先了解一下——你现在更接近哪种情况？A. 已经在投简历找工作了 B. 还没开始找，想先搞清楚自己适合什么 C. 我是应届生或在校生 D. 有几个方向在纠结",
      1: "我们先从反面开始——你最不想做什么类型的工作？为什么讨厌？",
      2: "你过去做什么事的时候会觉得时间过得很快？不管是工作还是业余都行。",
      3: "别人一般因为什么事来找你帮忙？你有没有被夸过什么但你当时觉得'这有什么好夸的'？",
      4: "信息收集得差不多了。聊了这些之后，有没有哪个方向让你觉得'这个可以试试'？",
    },
    D: {
      0: "在开始之前，我想先了解一下——你现在更接近哪种情况？A. 已经在投简历找工作了 B. 还没开始找，想先搞清楚自己适合什么 C. 我是应届生或在校生 D. 有几个方向在纠结",
      1: "把你的几个方向列出来。每个方向你觉得最吸引你的是什么？只用一句话。",
      2: "如果只能选一个先试1个月，你会选哪个？为什么不是另外几个？",
      3: "这几个方向，市场机会方面你有了解吗？你身边有做这些方向的人吗？",
      4: "信息收集得差不多了。准备给你输出定位卡——有没有哪个方向你现在可以排除了？",
    },
  };

  const branchKey = branch || "B";
  const branchPrompts = prompts[branchKey] || prompts["B"];
  return branchPrompts[stage] || "";
}
