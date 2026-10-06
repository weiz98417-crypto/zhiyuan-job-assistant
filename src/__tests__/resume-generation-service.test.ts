/** resume-generation-service 直接单测（spec 31）：硬门拦截/重试成功/软门低分降级/判官不可用/veto 全灭。
 *  这是该服务首个不 mock 掉自身的测试；外部依赖（DB/记忆/LLM/判官）全部 vi.mock。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDataRepositoriesMock, llmRetryMock, scoreAgentOutputMock } = vi.hoisted(() => ({
  getDataRepositoriesMock: vi.fn(),
  llmRetryMock: vi.fn(),
  scoreAgentOutputMock: vi.fn(),
}));

vi.mock("@/lib/data-repositories", () => ({ getDataRepositories: getDataRepositoriesMock }));
vi.mock("@/lib/agent/memory-context", () => ({
  assembleAgentMemoryContext: vi.fn(async () => ({ llmSummary: "用户负责10人团队,年营收800万,增长30%,擅长推荐系统" })),
}));
vi.mock("@/lib/llm-retry", () => ({ llmRetry: llmRetryMock }));
vi.mock("@/lib/agent/llm-scorers", () => ({
  scoreAgentOutput: scoreAgentOutputMock,
  BLOCKING_SCORE_THRESHOLD: 0.8,
}));

import { generateResumeDraftForAgent, ResumeGenerationInputError } from "@/lib/server/resume-generation-service";

const PRINCIPAL = { userId: "user_1" } as Parameters<typeof generateResumeDraftForAgent>[0];
const JD =
  "我们正在寻找资深推荐算法工程师,负责信息流推荐系统与特征平台的建设,推动大规模机器学习模型的线上化与效果优化,并带领团队完成跨部门的技术方案落地与人才培养。";
const BASE_EXPERIENCE =
  "我负责10人算法团队,年营收800万元,同比增长30%,主导推荐系统重构与灰度发布流程,建设特征平台并沉淀复盘机制,推动跨团队协作与核心成员培养,沉淀完整的面试与晋升辅导经验。";
const CLEAN_EXPERIENCE =
  "主导10人算法团队的推荐系统重构,年营收达800万元,同比增长30%;建设统一特征平台与灰度发布机制,沉淀复盘与晋升辅导流程,培养多名核心成员并推动跨团队协作落地。";
const FABRICATED_EXPERIENCE =
  "带领团队实现营收增长300%,覆盖用户500万,并负责10人团队,年营收800万元,同比增长30%,主导推荐系统与特征平台建设,沉淀方法论与人才培养机制,推动组织效能提升。";
const CLEAN_SKILLS = "熟练掌握 Python、SQL 与推荐系统建模,具备端到端特征工程与在线实验设计经验,熟悉大规模模型训练与部署。";

function sectionsPayload(sections: Array<{ id: string; label: string; content: string }>) {
  const body = { choices: [{ message: { content: JSON.stringify({ sections }) } }] };
  return { json: async () => body };
}

let storedDrafts: Array<Record<string, unknown>> = [];

beforeEach(() => {
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  storedDrafts = [];
  scoreAgentOutputMock.mockReset();
  llmRetryMock.mockReset();
  getDataRepositoriesMock.mockReturnValue({
    cv: { get: vi.fn(async () => ({ data_json: JSON.stringify({ activeVersion: "v1", versions: { v1: { sections: [{ id: "experience", content: BASE_EXPERIENCE }] } } }) })) },
    referenceResumes: { get: vi.fn(async () => null) },
    resumeDocuments: { getActive: vi.fn(async () => ({ id: "doc_1" })) },
    resumeDrafts: {
      listByArtifact: vi.fn(async () => storedDrafts),
      createArtifact: vi.fn(async (drafts: Array<Record<string, unknown>>) => {
        storedDrafts = drafts;
        return drafts;
      }),
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function parseContentJson(draft: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(String(draft.content_json)) as Record<string, unknown>;
}

describe("resume-generation-service 硬门(数字溯源,现状锁定)", () => {
  it("编造数字 → 带反馈重试一次 → 仍编造 → 报错不出稿,且软门判官从未被调用(先硬后软)", async () => {
    llmRetryMock.mockResolvedValue(sectionsPayload([{ id: "experience", label: "定制版", content: FABRICATED_EXPERIENCE }]));

    await expect(
      generateResumeDraftForAgent(PRINCIPAL, { jdText: JD, requestKey: "rk_hard_gate" }),
    ).rejects.toThrow(/数字溯源未通过（重试 1 次后仍失败）/);

    expect(llmRetryMock).toHaveBeenCalledTimes(2);
    expect(scoreAgentOutputMock).not.toHaveBeenCalled();
  });

  it("首遍编造 → 反馈重试后干净 → 出稿成功(重试只一次)", async () => {
    llmRetryMock
      .mockResolvedValueOnce(sectionsPayload([{ id: "experience", label: "定制版", content: FABRICATED_EXPERIENCE }]))
      .mockResolvedValueOnce(sectionsPayload([{ id: "experience", label: "经验定制版", content: CLEAN_EXPERIENCE }]));
    scoreAgentOutputMock.mockResolvedValue({ score: 0.95, hardVetoes: [] });

    const result = await generateResumeDraftForAgent(PRINCIPAL, { jdText: JD, requestKey: "rk_retry_ok" });

    expect(llmRetryMock).toHaveBeenCalledTimes(2);
    expect(result.readBackVerified).toBe(true);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].sectionId).toBe("experience");
    expect(result.drafts[0].content).toContain("800万");
  });
});

describe("resume-generation-service 软门(faithfulness,spec 31)", () => {
  it("低分无 veto → 出稿但「仅供参考」降级 + advisory 字段持久化;高分板块不受影响", async () => {
    llmRetryMock.mockResolvedValue(
      sectionsPayload([
        { id: "experience", label: "经验定制版", content: CLEAN_EXPERIENCE },
        { id: "skills", label: "技能定制版", content: CLEAN_SKILLS },
      ]),
    );
    scoreAgentOutputMock.mockImplementation(async (input: { output: string }) =>
      input.output.includes("推荐系统重构") ? { score: 0.5, hardVetoes: [] } : { score: 0.95, hardVetoes: [] },
    );

    const result = await generateResumeDraftForAgent(PRINCIPAL, { jdText: JD, requestKey: "rk_soft_low" });

    expect(llmRetryMock).toHaveBeenCalledTimes(1);
    expect(result.drafts).toHaveLength(2);
    const experienceDraft = result.drafts.find((draft) => draft.sectionId === "experience");
    const skillsDraft = result.drafts.find((draft) => draft.sectionId === "skills");
    expect(experienceDraft?.label).toMatch(/^仅供参考：/);
    const experienceJson = parseContentJson(storedDrafts.find((draft) => String(draft.variant_id) === "targeted_experience")!);
    expect(experienceJson.advisory).toBe(true);
    expect(experienceJson.factuality).toMatchObject({ faithfulnessScore: 0.5 });
    expect(String(experienceJson.factuality && (experienceJson.factuality as Record<string, unknown>).advisoryReason)).toMatch(/低于阈值/);
    expect(skillsDraft?.label).not.toMatch(/仅供参考/);
    // 判官的事实源 = 硬门同一组来源(原简历+JD+记忆)
    const firstCall = scoreAgentOutputMock.mock.calls[0][0] as { sourceMaterials: string[]; taskType: string };
    expect(firstCall.taskType).toBe("resume_edit");
    expect(firstCall.sourceMaterials).toEqual(expect.arrayContaining([expect.stringContaining("推荐系统重构"), JD]));
  });

  it("判官不可用 → 不阻塞,未评分板块无降级前缀地放行(与优化链 :236 同语义)", async () => {
    llmRetryMock.mockResolvedValue(sectionsPayload([{ id: "experience", label: "经验定制版", content: CLEAN_EXPERIENCE }]));
    scoreAgentOutputMock.mockRejectedValue(new Error("judge unavailable"));

    const result = await generateResumeDraftForAgent(PRINCIPAL, { jdText: JD, requestKey: "rk_judge_down" });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].label).toBe("经验定制版");
    const contentJson = parseContentJson(storedDrafts[0]);
    expect(contentJson.advisory).toBe(false);
    expect(contentJson.factuality).toEqual({});
  });

  it("判官 veto(编造判定)→ 该 section 淘汰;全灭 → 报错不出稿", async () => {
    llmRetryMock.mockResolvedValue(sectionsPayload([{ id: "experience", label: "经验定制版", content: CLEAN_EXPERIENCE }]));
    scoreAgentOutputMock.mockResolvedValue({ score: 0.95, hardVetoes: ["fabrication:500万"] });

    await expect(
      generateResumeDraftForAgent(PRINCIPAL, { jdText: JD, requestKey: "rk_veto_all" }),
    ).rejects.toThrow(/产物未通过忠实度校验/);
    expect(storedDrafts).toHaveLength(0);
  });
});
