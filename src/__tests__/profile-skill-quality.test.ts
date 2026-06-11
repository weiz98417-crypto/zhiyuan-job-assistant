import { describe, expect, it } from "vitest";
import {
  normalizeDealBreaker,
  normalizeProfileSignalForStorage,
  normalizeSkillClaim,
  PROFILE_SIGNAL_CATEGORIES,
  PROFILE_SIGNAL_SOURCE_WEIGHTS,
  sanitizeDealBreakers,
  sanitizeProfileSkills,
  sanitizeSkillClaims,
} from "@/lib/profile-skill-quality";
import { scanMessage } from "@/lib/agent/signal-extractor";
import { buildFallbackProfile } from "@/lib/profile-mining";

describe("profile skill quality gate", () => {
  it("rejects JD fragments, interview prompts, generic words, and chat filler", () => {
    const rejected = [
      "过至少1个数据经营或BI类项目",
      "其中至少2年产品",
      "的技术方案",
      "优先邀你下午茶",
      "业务",
      "技术",
      "请描述整体流程",
      "入职后如果产品研发团队让你做一个数据",
    ];

    for (const phrase of rejected) {
      expect(normalizeSkillClaim({ skill: phrase, evidence: phrase, confidence: 0.9 })).toBeNull();
    }
  });

  it("requires user-owned evidence before accepting a known skill", () => {
    expect(normalizeSkillClaim({
      skill: "API",
      evidence: "JD 要求熟悉 API",
      confidence: 0.9,
    })).toBeNull();

    expect(normalizeSkillClaim({
      skill: "API",
      evidence: "我在项目中设计过 REST API",
      confidence: 0.7,
    })?.skill).toBe("API 设计");
  });

  it("normalizes and deduplicates credible user-owned skill claims", () => {
    const claims = sanitizeSkillClaims([
      { skill: "RAG", evidence: "我做过 RAG 知识库", confidence: 0.7 },
      { skill: "YOLOv8", evidence: "我参与过 YOLOv8 模型落地", confidence: 0.7 },
      { skill: "指标体系", evidence: "我负责过数据分析和指标体系设计", confidence: 0.7 },
      { skill: "YOLOv8", evidence: "我在项目中使用 YOLOv8 做目标检测", confidence: 0.8 },
    ]);

    expect(claims.map((claim) => claim.skill)).toEqual(["YOLOv8", "RAG", "指标体系设计"]);
  });

  it("filters polluted LLM profile skills before display", () => {
    const skills = sanitizeProfileSkills([
      { name: "求职活跃度", proficiency: 70, evidence: ["投递 7 个岗位"], source: "inferred" },
      { name: "过至少1个数据经营或BI类项目", proficiency: 80, evidence: ["任职要求：负责过至少1个数据经营或BI类项目"], source: "auto" },
      { name: "数据分析", proficiency: 74, evidence: ["我负责过数据分析和指标体系设计"], source: "auto" },
      { name: "RAG", proficiency: 72, evidence: ["我做过 RAG 知识库"], source: "auto" },
    ]);

    expect(skills.map((skill) => skill.name)).toEqual(["数据分析", "RAG"]);
  });

  it("enriches valid chat skills as candidates with evidence and source metadata", () => {
    const decision = normalizeProfileSignalForStorage({
      source: "auto_scan",
      signal_type: "skill_claim",
      content_json: {
        skill: "YOLOv8",
        evidence: "我参与过 YOLOv8 模型落地",
        confidence: 0.76,
      },
      session_id: "s1",
    });

    expect(decision.accepted).toBe(true);
    expect(decision.signal?.content_json).toMatchObject({
      skill: "YOLOv8",
      status: "candidate",
      sourceType: "ordinary_chat",
      evidenceCount: 1,
    });
    expect(decision.signal?.content_json.sourceWeight).toBe(PROFILE_SIGNAL_SOURCE_WEIGHTS.ordinary_chat);
    expect(PROFILE_SIGNAL_CATEGORIES).toContain(decision.signal?.content_json.category);
  });

  it("keeps JD-only requirements out of user profile signals", () => {
    const decision = normalizeProfileSignalForStorage({
      source: "jd",
      signal_type: "skill_claim",
      content_json: {
        skill: "主数据管理",
        evidence: "任职要求：理解主数据、数据集、数仓等基础技术概念",
        confidence: 0.9,
      },
    });

    expect(decision.accepted).toBe(false);
    expect(decision.rejectedReason).toBe("jd_requirement_is_not_user_skill");
  });

  it("allows resume-backed skills to become confirmed candidates", () => {
    const decision = normalizeProfileSignalForStorage({
      source: "resume_import",
      signal_type: "skill_claim",
      content_json: {
        skill: "RAG",
        evidence: "简历：我做过 RAG 知识库检索增强项目",
        confidence: 0.82,
      },
    });

    expect(decision.accepted).toBe(true);
    expect(decision.signal?.content_json).toMatchObject({
      skill: "RAG",
      status: "confirmed",
      sourceType: "resume",
    });
  });

  it("rejects polluted dealbreaker fragments from chat actions", () => {
    const fragments = [
      { value: "去寻", evidence: "拒绝此 Offer ] 👈 (去寻" },
      { value: "先解", evidence: "不要先解" },
      { value: "野蛮", evidence: "拒绝野蛮" },
      { value: "此 Offer", evidence: "拒绝此 Offer" },
    ];

    for (const fragment of fragments) {
      expect(normalizeDealBreaker(fragment.value, fragment.evidence)).toBeNull();
      expect(normalizeProfileSignalForStorage({
        source: "auto_scan",
        signal_type: "dealbreaker",
        content_json: { value: fragment.value, evidence: fragment.evidence, confidence: 0.8 },
      })).toMatchObject({
        accepted: false,
        rejectedReason: "invalid_constraint",
      });
    }

    expect(scanMessage("不要先解，先问清楚再做", "s1").some((s) => s.signal_type === "dealbreaker")).toBe(false);
    expect(scanMessage("拒绝此 Offer ] 👈 (去寻", "s1").some((s) => s.signal_type === "dealbreaker")).toBe(false);
  });

  it("keeps real career constraints as dealbreakers", () => {
    expect(normalizeDealBreaker("996", "不接受 996")).toBe("996");
    expect(normalizeDealBreaker("外包公司", "不考虑外包公司")).toBe("外包公司");
    expect(normalizeDealBreaker("双休", "必须双休")).toBe("双休");
    expect(normalizeDealBreaker("outsourcing", "不考虑 outsourcing")).toBe("outsourcing");

    const decision = normalizeProfileSignalForStorage({
      source: "auto_scan",
      signal_type: "dealbreaker",
      content_json: { value: "外包公司", evidence: "我不考虑外包公司", confidence: 0.8 },
    });
    expect(decision.accepted).toBe(true);
    expect(decision.signal?.content_json).toMatchObject({
      value: "外包公司",
      status: "candidate",
      sourceType: "ordinary_chat",
    });

    expect(sanitizeDealBreakers(["去寻", "996", "不接受 996", "野蛮", "外包公司"])).toEqual([
      "不接受 996",
      "外包公司",
    ]);
  });

  it("keeps confirmed user edits ahead of model-inferred duplicates", () => {
    const skills = sanitizeProfileSkills([
      { name: "API 设计", proficiency: 65, evidence: ["我确认 API 设计是核心技能"], source: "manual" },
      { name: "API", proficiency: 95, evidence: ["我在项目中设计过 REST API"], source: "auto" },
    ]);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "API 设计",
      proficiency: 65,
      source: "manual",
    });
  });
});

describe("profile fallback", () => {
  it("keeps behavior stats out of core skills", () => {
    const profile = buildFallbackProfile({
      totalApplications: 8,
      passRate: 25,
      statusDistribution: { applied: 6, interview: 2 },
      avgScore: 3.6,
      industryDistribution: { AI: 2 },
      companySizeHints: { large: 2, sme: 4, startup: 2 },
      totalPracticeCount: 5,
      practiceByCategory: { behavioral: 5 },
    });

    expect(profile.skills).toEqual([]);
    expect(profile.history[0].changes.join(" ")).toContain("行为指标已保留在画像概览");
  });
});
