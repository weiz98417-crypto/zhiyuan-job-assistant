import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildReferenceResumeRawText,
  buildReferenceResumeRetrievalQuery,
  computeReferenceSnippetScore,
  detectSaveExcellentResumeIntent,
  looksLikeResumeText,
  normalizeReferenceVisibility,
  normalizeRoleCategory,
  redactReferenceResumeText,
  scoreReferenceResumeQuality,
  type ReferenceResumeSection,
} from "@/lib/reference-resume-vector";
import { resumeAgent } from "@/lib/agent/registry/agents/resume-agent";
import { saveReferenceResume } from "@/lib/agent/tools/action/save-reference-resume";

const sections: ReferenceResumeSection[] = [
  {
    id: "summary",
    title: "个人概述",
    content: "AI产品经理，熟悉大模型应用、RAG知识库、数据分析和端到端产品落地。",
  },
  {
    id: "experience",
    title: "工作经历",
    content: "在某科技公司负责AI助手产品，从0到1推进需求调研、PRD、数据看板和跨部门协作，月活提升35%。",
  },
  {
    id: "projects",
    title: "项目经历",
    content: [
      "RAG知识库项目：完成召回评估、提示词工程、权限设计和灰度发布，答案准确率提升28%。",
      "多模态分析项目：设计图片识别链路、异常兜底和质量评估闭环，处理效率提升40%。",
    ].join("\n"),
  },
  {
    id: "skills",
    title: "专业技能",
    content: "产品规划、用户研究、SQL、Python、RAG、Prompt Engineering、A/B测试、数据指标体系。",
  },
  {
    id: "education",
    title: "教育经历",
    content: "计算机相关专业硕士，主修机器学习、软件工程和数据挖掘。",
  },
];

describe("reference resume vector helpers", () => {
  it("detects explicit excellent resume save intent", () => {
    expect(detectSaveExcellentResumeIntent("把这份简历保存成AI产品经理优秀简历")).toBe(true);
    expect(detectSaveExcellentResumeIntent("加入参考简历库，后面优化简历用")).toBe(true);
    expect(detectSaveExcellentResumeIntent("帮我评估这个JD")).toBe(false);
  });

  it("recognizes complete resume-like text and rejects noisy fragments", () => {
    const resumeText = buildReferenceResumeRawText(sections).repeat(2);
    expect(looksLikeResumeText(resumeText)).toBe(true);
    expect(looksLikeResumeText("岗位要求：至少3年数据产品经验，理解主数据、数仓、UAT。")).toBe(false);
  });

  it("normalizes role categories and visibility values", () => {
    expect(normalizeRoleCategory("AI产品经理")).toBe("ai_product_manager");
    expect(normalizeRoleCategory("AI运营")).toBe("ai_operations");
    expect(normalizeRoleCategory("AI售前解决方案")).toBe("ai_presales");
    expect(normalizeRoleCategory("数据产品经理")).toBe("data_product_manager");
    expect(normalizeReferenceVisibility("lan")).toBe("team");
    expect(normalizeReferenceVisibility("pending")).toBe("team_pending");
    expect(normalizeReferenceVisibility(undefined)).toBe("private");
  });

  it("redacts personal contact data before shared retrieval", () => {
    const redacted = redactReferenceResumeText("张三 13812345678 zhangsan@example.com 微信: zhangsan_pm 地址: 深圳市南山区科技园");
    expect(redacted).toContain("[REDACTED_PHONE]");
    expect(redacted).toContain("[REDACTED_EMAIL]");
    expect(redacted).toContain("[REDACTED_CONTACT]");
    expect(redacted).toContain("[REDACTED_ADDRESS]");
    expect(redacted).not.toContain("13812345678");
    expect(redacted).not.toContain("zhangsan@example.com");
  });

  it("scores complete, quantified resumes higher than fragments", () => {
    const richText = buildReferenceResumeRawText(sections).repeat(4);
    const richScore = scoreReferenceResumeQuality({ rawText: richText, sections });
    const fragmentScore = scoreReferenceResumeQuality({ rawText: "产品 业务 技术 API", sections: [] });
    expect(richScore).toBeGreaterThanOrEqual(0.8);
    expect(fragmentScore).toBeLessThan(0.3);
  });

  it("uses feedback as a small ranking signal without promoting bad samples", () => {
    const neutral = computeReferenceSnippetScore({ similarity: 0.8, quality: 0.8, roleScore: 1 });
    const accepted = computeReferenceSnippetScore({ similarity: 0.8, quality: 0.8, roleScore: 1, acceptedCount: 5 });
    const rejected = computeReferenceSnippetScore({ similarity: 0.8, quality: 0.8, roleScore: 1, rejectedCount: 5 });
    const weakButAccepted = computeReferenceSnippetScore({ similarity: 0.35, quality: 0.25, roleScore: 0.35, acceptedCount: 20 });
    const strongNeutral = computeReferenceSnippetScore({ similarity: 0.82, quality: 0.82, roleScore: 1 });

    expect(accepted).toBeGreaterThan(neutral);
    expect(rejected).toBeLessThan(neutral);
    expect(weakButAccepted).toBeLessThan(strongNeutral);
  });
});

describe("reference resume schema boundaries", () => {
  it("adds vector chunks and usage tables to PostgreSQL schema", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "src/lib/postgres-schema.sql"), "utf8");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS reference_resume_chunks");
    expect(schema).toContain("embedding vector(1536)");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS reference_resume_usage");
    expect(schema).toContain("idx_reference_resume_usage_user");
    expect(schema).toContain("idx_reference_resumes_hash");
  });

  it("does not delete reference_resume_chunks through the user_id cleanup list", () => {
    const repositories = fs.readFileSync(path.join(process.cwd(), "src/lib/data-repositories.ts"), "utf8");
    const userPrivateTables = repositories.match(/const USER_PRIVATE_TABLES = \[[\s\S]*?\];/)?.[0] || "";
    expect(userPrivateTables).toContain('"reference_resumes"');
    expect(userPrivateTables).toContain('"reference_resume_usage"');
    expect(userPrivateTables).not.toContain('"reference_resume_chunks"');
    expect(repositories).toContain("findBySourceHash");
    expect(repositories).toContain("source_hash=$1 AND user_id=$2");
    expect(repositories).toContain("user_id=$1 OR visibility='team'");
    expect(repositories).toContain("id=$1 AND (user_id=$2 OR visibility='team')");
    expect(repositories).toContain("DELETE FROM reference_resumes WHERE id=$1 AND user_id=$2");
  });

  it("short-circuits duplicate imports by source hash", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/import-reference/route.ts"), "utf8");
    expect(route).toContain("findBySourceHash(sourceHash, user.userId)");
    expect(route).toContain("duplicate: true");
    expect(route).toContain("Duplicate source hash");
  });

  it("provides admin review controls for pending team references", () => {
    const adminRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/reference-resumes/route.ts"), "utf8");
    const memoryRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/memory/route.ts"), "utf8");
    const memoryPage = fs.readFileSync(path.join(process.cwd(), "src/app/admin/memory/page.tsx"), "utf8");
    expect(adminRoute).toContain('payload.role !== "admin"');
    expect(adminRoute).toContain('"approve"');
    expect(adminRoute).toContain('"reject"');
    expect(adminRoute).toContain('"disable"');
    expect(memoryRoute).toContain('payload.role !== "admin"');
    expect(memoryRoute).toContain("approve_reference");
    expect(memoryRoute).toContain("reject_reference");
    expect(memoryRoute).toContain("disable_reference");
    expect(memoryPage).toContain("/api/admin/memory");
    expect(memoryPage).toContain("团队共享待审核");
    expect(memoryPage).toContain("低质量或高拒绝材料");
  });

  it("provides an owner-scoped reindex endpoint for failed chunks", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/references/[id]/reindex/route.ts"), "utf8");
    const detailRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/references/[id]/route.ts"), "utf8");
    const adminRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/reference-resumes/route.ts"), "utf8");

    expect(route).toContain("reindexReferenceResumeRecord");
    expect(route).toContain("resume.user_id && resume.user_id !== user.userId");
    expect(route).toContain("Forbidden");
    expect(detailRoute).toContain("reindexReferenceResumeRecord(latest, user.userId)");
    expect(adminRoute).toContain("reindexReferenceResumeRecord(latest, latest.user_id || admin.userId)");
  });

  it("wires semantic references into CV optimization with a no-match fallback", () => {
    const optimizeRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/optimize-section/route.ts"), "utf8");
    const judgeEngine = fs.readFileSync(path.join(process.cwd(), "src/lib/judge-engine.ts"), "utf8");
    expect(optimizeRoute).toContain("retrieveReferenceResumeSnippets");
    expect(optimizeRoute).toContain("fast && !semanticReferenceSnippets.length");
    expect(optimizeRoute).toContain("referenceSnippets: semanticReferenceSnippets");
    expect(judgeEngine).toContain("buildSemanticReferencePrompt(referenceSnippets)");
    expect(judgeEngine).toContain("Do not copy the reference wording verbatim");
  });
});

describe("reference resume retrieval and agent boundaries", () => {
  it("keeps retrieval scoped to owned references or approved team references", () => {
    const query = buildReferenceResumeRetrievalQuery({
      queryEmbedding: new Array(1536).fill(0),
      userId: "user-a",
      roleCategory: "AI产品经理",
      sectionType: "projects",
      limit: 4,
    });

    expect(query.sql).toContain("c.status = 'active'");
    expect(query.sql).toContain("c.owner_user_id = $2");
    expect(query.sql).toContain("c.visibility IN ('private','team_pending','team')");
    expect(query.sql).toContain("OR c.visibility = 'team'");
    expect(query.sql).toContain("c.role_category = ANY($3::text[])");
    expect(query.sql).toContain("(c.section_type = $4 OR c.section_type = '')");
    expect(query.sql).toContain("reference_resume_usage");
    expect(query.sql).toContain("accepted_count");
    expect(query.params[1]).toBe("user-a");
    expect(query.params[2]).toEqual(["ai_product_manager", "general", ""]);
    expect(query.limit).toBe(4);
  });

  it("exposes save_reference_resume only through the resume agent", async () => {
    expect(resumeAgent.toolNames).toContain("save_reference_resume");

    const missingText = await saveReferenceResume.handler({});
    expect(missingText.success).toBe(false);
    expect(missingText.errorCategory).toBe("need_user_input");

    const missingRole = await saveReferenceResume.handler({
      resume_text: buildReferenceResumeRawText(sections).repeat(2),
    });
    expect(missingRole.success).toBe(false);
    expect(missingRole.errorCategory).toBe("need_user_input");
    expect(missingRole.error).toContain("岗位方向");
  });
});
