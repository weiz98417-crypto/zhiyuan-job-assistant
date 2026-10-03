/**
 * Eval：面试题库与出题引擎（Spec 27 / ADR-0044）+ 追问内容缺口判定。
 * store 与 completion 全部注入，确定性断言、无 LLM 成本。
 */
import { describe, expect, it } from "vitest";
import { composeInterview, createPostgresQuestionBankStore, familyForRole, type QuestionBankStore, type BankQuestionRow } from "@/lib/server/question-bank";
import { decideFollowUp } from "@/lib/server/interview-analysis-service";
import { projectDurableInterviewEngineState } from "@/lib/agent/interview-session-state";

interface BankQueryCapture { family?: string; phase?: string; difficulty?: string; excludeQuestions?: string[]; limit?: number }

function mockStore(rows: BankQuestionRow[], available = true, seenQueries?: BankQueryCapture[]): QuestionBankStore {
  return {
    async isAvailable() { return available; },
    async queryCandidates(query) {
      seenQueries?.push(query);
      const filtered = rows.filter((row) =>
        (!query.family || row.family === query.family) &&
        (!query.phase || row.phase === query.phase) &&
        (!query.difficulty || row.difficulty === query.difficulty) &&
        !(query.excludeQuestions || []).includes(row.question));
      return filtered.slice(0, query.limit || 8);
    },
  };
}

const bankRows: BankQuestionRow[] = [
  { id: 1, question: "题库原题A：介绍一个RAG优化案例", topic: "RAG优化", family: "ai_algorithm", phase: "tech", difficulty: "medium", provenance: "generated_seed", provenanceDetail: "spec-27", answerPoints: "分层定位+数字" },
  { id: 2, question: "题库原题B：讲一次跨部门冲突", topic: "协作", family: "ai_product", phase: "behavioral", difficulty: "medium", provenance: "corpus:javaguide", provenanceDetail: "java-concurrency", answerPoints: "" },
];

describe("Spec 27: composeInterview 深接口（注入 store + completion）", () => {
  it("题库命中：未带 provenance 的改写题如实标注 bank_unverified（宁诚实不冒充）", async () => {
    const completion = async () => ({
      text: JSON.stringify({ questions: [{ question: "改编题：结合你的简历讲一个RAG优化案例", source: "bank" }] }),
    });
    const result = await composeInterview({ family: "ai_algorithm", phase: "tech", count: 1 }, {
      store: mockStore(bankRows),
      completion,
    });
    expect(result.bankUsed).toBe(1);
    expect(result.questions[0].source).toBe("bank");
    expect(result.questions[0].provenance).toBe("bank_unverified");
  });

  it("非题库来源的题目允许 jd/general 出处", async () => {
    const completion = async () => ({
      text: JSON.stringify({ questions: [{ question: "结合JD讲讲你的优势", source: "jd" }] }),
    });
    const result = await composeInterview({ family: "ai_product", count: 1 }, { store: mockStore(bankRows), completion });
    expect(result.questions[0].source).toBe("jd");
    expect(result.questions[0].provenance).toBe("jd");
  });

  it("无出处标签的题库题如实标注 bank_unverified（宁诚实不冒充）", async () => {
    const completion = async () => ({
      text: JSON.stringify({ questions: [{ question: "题库原题A：介绍一个RAG优化案例", source: "bank" }, { question: "无出处题", source: "bank" }] }),
    });
    const result = await composeInterview({ count: 2 }, { store: mockStore(bankRows), completion });
    expect(result.questions[0].provenance).toBe("generated_seed");
    expect(result.questions[1].provenance).toBe("bank_unverified");
  });

  it("store 不可用（SQLite/表未建）→ 空 questions + bankUnavailable，调用方回落 LLM 直出", async () => {
    const result = await composeInterview({ count: 1 }, { store: mockStore([], false), completion: async () => ({ text: "{}" }) });
    expect(result.questions).toEqual([]);
    expect(result.bankUnavailable).toBe("postgres_unavailable");
  });

  it("store 可用但题库为空 → bank_empty", async () => {
    const result = await composeInterview({ count: 1 }, { store: mockStore([]), completion: async () => ({ text: "{}" }) });
    expect(result.bankUnavailable).toBe("bank_empty");
  });

  it("过滤参数正确下推：family×phase + 已出题目去重", async () => {
    const captured: BankQueryCapture[] = [];
    await composeInterview({ family: "ai_product", phase: "behavioral", count: 1, recentQuestions: ["已问题目"] }, {
      store: mockStore(bankRows, true, captured),
      completion: async () => ({ text: "{}" }),
    });
    expect(captured[0].family).toBe("ai_product");
    expect(captured[0].phase).toBe("behavioral");
    expect(captured[0].excludeQuestions).toContain("已问题目");
  });

  it("familyForRole 岗位族映射", () => {
    expect(familyForRole("AI产品经理")).toBe("ai_product");
    expect(familyForRole("算法工程师")).toBe("ai_algorithm");
    expect(familyForRole("AI运营")).toBe("ai_business");
    expect(familyForRole("AI售前顾问")).toBe("ai_business");
    expect(familyForRole("后端开发工程师")).toBe("tech_general");
    expect(familyForRole("神秘岗位")).toBe("general");
  });
});

describe("Spec 27: 追问内容缺口判定", () => {
  it("回答过短（<20字）直接追问（兜底，免 LLM）", async () => {
    const result = await decideFollowUp("还行吧", "介绍一个项目", { completion: async () => { throw new Error("不应调用"); } });
    expect(result.followUp).toBe(true);
    expect(result.usedFallback).toBe(true);
  });

  it("LLM 判定有缺口 → 追问并带缺口说明", async () => {
    const result = await decideFollowUp("我之前做了一个智能客服项目，主要做了需求分析和上线推进，最后效果还不错就顺利上线了。", "介绍一个项目", {
      completion: async () => ({ text: JSON.stringify({ needsFollowUp: true, gap: "缺少量化结果" }) }),
    });
    expect(result.followUp).toBe(true);
    expect(result.gap).toBe("缺少量化结果");
    expect(result.usedFallback).toBe(false);
  });

  it("LLM 判定无缺口 → 直接评分（不再强制每题追问）", async () => {
    const result = await decideFollowUp("背景是客服成本高，我做意图分类优化，转人工率从40%降到25%，后续又做了自助知识库再降7个点，全程负责方案与跨团队推进。", "介绍一个项目", {
      completion: async () => ({ text: JSON.stringify({ needsFollowUp: false, gap: "" }) }),
    });
    expect(result.followUp).toBe(false);
  });

  it("LLM 失败 → 长度规则兜底（<50 字追问，长回答放行）", async () => {
    const short = await decideFollowUp("效果挺好的。", "介绍一个项目", { completion: async () => { throw new Error("llm down"); } });
    expect(short.followUp).toBe(true);
    const long = await decideFollowUp("很长的完整回答".repeat(10), "介绍一个项目", { completion: async () => { throw new Error("llm down"); } });
    expect(long.followUp).toBe(false);
  });
});

describe("Spec 27 / ADR-0044: 状态机单写者投影", () => {
  const durableState = {
    company: "字节跳动", role: "AI产品经理", phase: "tech", questionIndex: 1, checkpointVersion: 3,
    questions: [
      { id: "q1", phase: "intro", text: "请自我介绍", type: "tech" },
      { id: "q2", phase: "tech", text: "讲一个RAG项目", type: "tech" },
    ],
    answers: [
      { questionId: "q1", question: "请自我介绍", answer: "我是某某，5年AI产品经验", score: 8, feedback: "结构清晰", followups: [{ question: "你说的Agent产品具体是什么", answer: "是多步执行的产品" }] },
    ],
    currentQuestion: { id: "q3", phase: "tech", text: "当前进行中的题目", type: "tech" },
    currentFollowups: ["进行中的追问"],
  };

  it("durable 引擎状态 → 纯投影：主问题/追问归属/当前题全部来自持久化状态", () => {
    const projection = projectDurableInterviewEngineState(durableState);
    expect(projection).toBeTruthy();
    expect(projection!.planSnapshot.jdSnapshot?.company).toBe("字节跳动");
    const mains = projection!.questionGraph.filter((n) => n.kind === "main");
    expect(mains.map((n) => n.question)).toContain("请自我介绍");
    expect(mains.map((n) => n.question)).toContain("当前进行中的题目");
    const followups = projection!.questionGraph.filter((n) => n.kind === "follow_up");
    expect(followups.length).toBe(2); // 已答追问 + 进行中追问
    // 追问必须归属原主问题节点（「请自我介绍」）——不是自指比较
    const introMain = projection!.questionGraph.find((n) => n.kind === "main" && n.question === "请自我介绍");
    expect(followups[0].parentId).toBe(introMain!.id);
    expect(projection!.transcript.length).toBeGreaterThanOrEqual(2);
    expect(projection!.scoreArtifacts.length).toBe(1);
  });

  it("投影是纯函数：同一状态两次投影结果一致（不读消息文本）", () => {
    const a = projectDurableInterviewEngineState(durableState);
    const b = projectDurableInterviewEngineState(durableState);
    expect(a!.questionGraph.map((n) => `${n.kind}:${n.question}`)).toEqual(b!.questionGraph.map((n) => `${n.kind}:${n.question}`));
  });

  it("非 durable 形状（旧投影会话）→ undefined，走既有消息重建路径", () => {
    const legacyState = { planSnapshot: { snapshotId: "plan1", mode: "realistic", difficulty: "normal", focusAreas: [], allowFollowUps: true, createdAt: "t", source: {} } };
    expect(projectDurableInterviewEngineState(legacyState)).toBeUndefined();
    expect(projectDurableInterviewEngineState(undefined)).toBeUndefined();
    expect(projectDurableInterviewEngineState({ company: "字节" })).toBeUndefined(); // 缺 role/phase
  });
});

describe("Spec 27: 种子脚本与 schema 纪律", () => {
  it("种子文件全部带出处标签（无标签不入库纪律的前置）", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const seedsDir = path2.join(process.cwd(), "scripts", "question-seeds");
    for (const file of readdirSync(seedsDir).filter((f) => f.endsWith(".json"))) {
      const payload = JSON.parse(readFileSync(path2.join(seedsDir, file), "utf8"));
      expect(payload.provenance, `${file} 必须带 provenance`).toBeTruthy();
      for (const q of payload.questions) {
        expect(q.question, `${file} 题干非空`).toBeTruthy();
        expect(q.topic, `${file} 考查点非空`).toBeTruthy();
      }
    }
  });

  it("postgres-schema.sql 包含四张新表且 Postgres-only（无 SQLite 分支）", async () => {
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync(path2.join(process.cwd(), "src", "lib", "postgres-schema.sql"), "utf8");
    for (const table of ["interview_questions", "interview_experiences", "interview_weakness_events", "salary_benchmarks"]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS salary_min");
  });
});

import path2 from "node:path";
