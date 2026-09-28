import { describe, expect, it } from "vitest";
import {
  buildResumeIntegrityEvidence,
  chunkResumeText,
  createResumeIntake,
  invalidateResumeIntegrityEvidence,
  mergeParsedResumeChunks,
  normalizeResumeSections,
  type ParsedResumeChunk,
} from "@/lib/resume/document";
import {
  canUndoSectioningPreview,
  sectioningPreviewHash,
  separateCvExperienceProjects,
} from "@/lib/resume/sectioning";

describe("resume document intake primitives", () => {
  it("chunks long source without dropping the tail", () => {
    const source = `${"前段经历。".repeat(4200)}\n\n尾部唯一项目成果：TAIL-RESUME-20000`;
    const chunks = chunkResumeText(source, 2400, 120);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.at(-1)?.text).toContain("TAIL-RESUME-20000");
    expect(chunks.at(-1)?.end).toBe(source.length);
  });

  it("deterministically merges overlapping parsed chunks", () => {
    const first = normalizeResumeSections({ experience: "公司 A\n负责平台建设", projects: "项目 X\n成果 100%" });
    const second = normalizeResumeSections({ experience: "负责平台建设\n带领团队", projects: "项目 X\n成果 100%\n新增模块" });
    const merged = mergeParsedResumeChunks([
      { index: 0, start: 0, end: 10, text: "一", sections: first },
      { index: 1, start: 5, end: 20, text: "二", sections: second },
    ] as ParsedResumeChunk[]);
    expect(merged.experience).toBe("公司 A\n负责平台建设\n带领团队");
    expect(merged.projects).toContain("成果 100%");
    expect(merged.projects).toContain("新增模块");
    expect(merged.projects.match(/项目 X/g)?.length).toBe(1);
  });

  it("separates a titled project from a saved work section without changing the source sections", () => {
    const original = [
      {
        id: "experience",
        title: "工作经历",
        content: [
          "杭州某科技有限公司\nAI 产品经理\n2024.12 - 2025.10",
          "工作概述：负责 AI 产品设计与落地。",
          "【AI 数字员工（客服/行政场景）】",
          "项目背景：客服处理多渠道工单效率低。",
          "## 核心工作",
          "设计 Agent 能力边界与交互原型。",
          "某银行 2023 年风控平台项目",
          "另一家公司",
          "产品经理",
          "2022.01 - 2024.11",
          "负责业务平台规划。",
          "项目经历",
          "数据分析平台项目",
          "项目成果：报表生成时间缩短 50%。",
        ].join("\n"),
      },
      { id: "projects", title: "项目经验", content: "已有项目：数据平台" },
    ];

    const separated = separateCvExperienceProjects(original);

    expect(separated.movedText).toContain("【AI 数字员工（客服/行政场景）】");
    expect(separated.sections[0].content).toContain("杭州某科技有限公司");
    expect(separated.sections[0].content).toContain("另一家公司\n产品经理\n2022.01 - 2024.11");
    expect(separated.sections[0].content).not.toContain("项目背景");
    expect(separated.sections[0].content).not.toContain("数据分析平台项目");
    expect(separated.sections[1].content).toContain("已有项目：数据平台");
    expect(separated.sections[1].content).toContain("设计 Agent 能力边界");
    expect(separated.sections[1].content).toContain("报表生成时间缩短 50%");
    expect(separated.sections[1].content).toContain("某银行 2023 年风控平台项目");
    expect(original[0].content).toContain("项目背景");
  });

  it("keeps dated testing jobs when their work overview mentions projects", () => {
    const workBlocks = [
      [
        "紫光云数科技有限公司杭州分公司",
        "AI 服务器测试工程师",
        "2023.04–2023.12",
        "工作概述：负责 AI 服务器测试，参与服务器平台项目，执行测试计划并跟踪缺陷。",
      ].join("\n"),
      [
        "浙江之科云启科技有限公司",
        "车载测试",
        "2022.02–2022.11",
        "工作概述：负责车载测试项目，记录测试结果并协助定位问题。",
      ].join("\n"),
      [
        "浙江斑智科技有限公司",
        "软件测试",
        "2021.03–2021.12",
        "工作概述：参与软件项目测试，编写测试用例并验证发布版本。",
      ].join("\n"),
    ];
    const projectBlocks = [
      "【AI 数字员工（客服/行政场景）】\n项目背景：缩短多渠道工单处理时间。\n核心工作：设计能力边界与知识检索。",
      "【服务器性能验证】\n项目背景：验证模型部署的性能。\n项目成果：形成性能基线。",
      "【车载交互验证】\n项目背景：验证车载交互流程。\n项目成果：完成回归测试。",
    ];
    const source = [
      "杭州某科技有限公司\nAI 产品经理\n2024.12–2025.10\n工作概述：负责 AI 产品设计。",
      projectBlocks[0],
      workBlocks[0],
      projectBlocks[1],
      workBlocks[1],
      projectBlocks[2],
      workBlocks[2],
    ].join("\n\n");
    const separated = separateCvExperienceProjects([
      { id: "experience", title: "工作经历", content: source },
      { id: "projects", title: "项目经验", content: "" },
    ]);
    const work = separated.sections.find((section) => section.id === "experience")!.content;
    const projects = separated.sections.find((section) => section.id === "projects")!.content;

    for (const block of workBlocks) {
      expect(work).toContain(block);
      expect(projects).not.toContain(block);
    }
    for (const block of projectBlocks) {
      expect(projects).toContain(block);
      expect(work).not.toContain(block);
    }
    const sourceLines = source.split("\n").filter((line) => line.trim()).sort();
    const separatedLines = [work, projects].flatMap((text) => text.split("\n")).filter((line) => line.trim()).sort();
    expect(separatedLines).toEqual(sourceLines);
  });

  it("only allows preview undo when the user has not edited the preview", () => {
    const preview = [
      { id: "experience", title: "工作经历", content: "公司 A" },
      { id: "projects", title: "项目经验", content: "项目 A" },
    ];
    const previewHash = sectioningPreviewHash(preview);
    expect(canUndoSectioningPreview(preview, previewHash)).toBe(true);
    expect(canUndoSectioningPreview([
      { ...preview[0], content: "公司 A\n用户补充的一行" },
      preview[1],
    ], previewHash)).toBe(false);
  });

  it("keeps general work duties and creates a missing project section only for explicit project content", () => {
    const work = "某科技公司 2023.01 - 至今\n核心工作：负责项目管理和产品交付。";
    expect(separateCvExperienceProjects([{ id: "experience", title: "工作经历", content: work }]).movedText).toBe("");

    const separated = separateCvExperienceProjects([{
      id: "experience",
      title: "工作经历",
      content: `${work}\n项目名称：智能招聘助手\n项目成果：覆盖 100 家企业。`,
    }]);
    expect(separated.sections.map((section) => section.id)).toEqual(["experience", "projects"]);
    expect(separated.sections[0].content).toBe(work);
    expect(separated.sections[1].content).toContain("覆盖 100 家企业");
  });

  it("does not move an isolated project outcome bullet out of work duties", () => {
    const work = "某科技公司\n产品经理\n2023.01 - 2024.01\n工作概述：负责交付。\n项目成果：提升团队交付效率。";
    expect(separateCvExperienceProjects([{ id: "experience", title: "工作经历", content: work }]).movedText).toBe("");
  });

  it("marks missing source facts for review instead of silently activating", () => {
    const source = "张三\n电话 13800138000\n负责支付系统，覆盖 99.9% 可用性\n尾部事实 TAIL-FACT";
    const sections = normalizeResumeSections({ summary: "张三", experience: "负责支付系统" });
    const evidence = buildResumeIntegrityEvidence(source, sections, 1);
    expect(evidence.status).toBe("needs_review");
    expect(evidence.numericCoverageRatio).toBeLessThan(1);
    expect(evidence.missingSourceUnits.join(" ")).toContain("TAIL-FACT");
  });

  it("never auto-activates image evidence reconstructed from the same model output", () => {
    const sections = normalizeResumeSections({ experience: "负责 Agent 产品设计，交付业务结果 100%。" });
    const reconstructed = "【工作经历】\n负责 Agent 产品设计，交付业务结果 100%。";
    const evidence = buildResumeIntegrityEvidence(reconstructed, sections, 1, {
      verificationMode: "model_reconstructed",
    });

    expect(evidence.coverageRatio).toBe(1);
    expect(evidence.numericCoverageRatio).toBe(1);
    expect(evidence.status).toBe("needs_review");
    expect(evidence.warnings[0]).toContain("独立 OCR 原文");
  });

  it("keeps a low-integrity import pending without replacing the active version", () => {
    const sections = normalizeResumeSections({ summary: "张三，AI 产品经理" });
    const integrity = buildResumeIntegrityEvidence(
      "张三，AI 产品经理。尾部事实 TAIL-FACT 2026。",
      sections,
      1,
    );
    const intake = createResumeIntake({
      userId: "user-pending-import",
      existingCvData: {
        activeVersion: "v1",
        versions: {
          v1: { id: "v1", label: "当前版本", createdAt: "2026-08-18", sections: [], source: "manual" },
        },
      },
      sections,
      rawText: "张三，AI 产品经理。尾部事实 TAIL-FACT 2026。",
      sourceType: "paste",
      chunks: [{ index: 0, start: 0, end: 34, text: "张三，AI 产品经理。尾部事实 TAIL-FACT 2026。", sections }],
      integrity,
    });

    expect(integrity.status).toBe("needs_review");
    expect(intake.activate).toBe(false);
    expect(intake.document).toMatchObject({ version_id: "v2", status: "pending", activated_at: null });
    expect(intake.cvData.activeVersion).toBe("v1");
    expect(intake.cvData.versions.v2).toMatchObject({ integrityStatus: "needs_review" });
  });

  it("invalidates intake evidence when the canonical document content changes", () => {
    const invalidated = JSON.parse(invalidateResumeIntegrityEvidence(
      JSON.stringify({ status: "valid", warnings: [], sourceHash: "source-hash" }),
      "document-hash-before",
      "document-hash-after",
    ));

    expect(invalidated).toMatchObject({
      status: "needs_review",
      invalidationReason: "content_changed_since_intake",
      evidenceContentHash: "document-hash-before",
      currentContentHash: "document-hash-after",
      sourceHash: "source-hash",
    });
    expect(invalidated.warnings[0]).toContain("不再适用于当前正文");
  });
});
