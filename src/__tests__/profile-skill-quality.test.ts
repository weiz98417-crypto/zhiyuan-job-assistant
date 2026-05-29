import { describe, expect, it } from "vitest";
import {
  normalizeSkillClaim,
  sanitizeProfileSkills,
  sanitizeSkillClaims,
} from "@/lib/profile-skill-quality";
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
