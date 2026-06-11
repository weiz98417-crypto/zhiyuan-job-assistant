import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildResumeSavePlan,
  claimsResumeSaved,
  sanitizeUnsupportedResumeSaveClaim,
  validateResumeSectionContent,
} from "@/lib/agent/resume-save-guard";
import { saveResumeSection } from "@/lib/agent/tools/action/save-resume-section";
import { stableContentHash } from "@/lib/agent/verified-action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resume save guard", () => {
  it("builds a real save plan from a pasted revised skills list", () => {
    const plan = buildResumeSavePlan([
      {
        role: "user",
        content: `技能清单你没改啊

✅ 改为：

核心能力

AI产品全链路设计（大模型选型 → Agent/RAG架构设计 → Prompt调优 → 效果评测）
Prompt Engineering & System Prompt策略调优（多轮对话、角色人设、边界治理）

技术工具

LLM应用开发框架：LangChain / 向量数据库 / RAG知识库构建
产品协作工具：Figma（原型设计）、JIRA / Notion / Confluence

模型输出说自己保存了，但是我去简历页面看了，并没有保存`,
      },
    ]);

    expect(plan?.section).toBe("skills");
    expect(plan?.reason).toBe("direct-pasted-revision");
    expect(plan?.content).toContain("AI产品全链路设计");
    expect(plan?.content).toContain("产品协作工具");
    expect(plan?.content).not.toContain("模型输出");
  });

  it("builds a save plan from the latest optimization tool result", () => {
    const plan = buildResumeSavePlan([
      {
        role: "tool",
        content: `## ✅ 技能 优化方案

### 第一版
核心能力

AI产品全链路设计
Prompt Engineering

*策略: 聚焦 AI 产品*

### 第二版
SQL / 数据分析

---
⚠️ 请选择一个方案`,
      },
      { role: "user", content: "应用第一版到技能清单" },
    ]);

    expect(plan?.section).toBe("skills");
    expect(plan?.reason).toBe("recent-optimization-result");
    expect(plan?.content).toContain("AI产品全链路设计");
    expect(plan?.content).not.toContain("策略");
  });

  it("does not hijack excellent reference resume save requests", () => {
    const plan = buildResumeSavePlan([
      { role: "assistant", content: "这是一份优秀简历。" },
      { role: "user", content: "保存成 AI 产品经理优秀简历" },
    ]);

    expect(plan).toBeNull();
  });

  it("rejects placeholder edit instructions instead of treating them as project content", async () => {
    const corrupted = "**工作经历 — 携程**（保持原有详细描述，不动）\n\n**项目经验** → 替换为：";

    expect(validateResumeSectionContent("projects", corrupted)).toMatchObject({
      valid: false,
    });

    const plan = buildResumeSavePlan([
      {
        role: "assistant",
        content: `修改后：\n${corrupted}`,
      },
      { role: "user", content: "就按这个保存到项目经验" },
    ]);
    expect(plan).toBeNull();

    const result = await saveResumeSection.handler({ section: "项目经验", content: corrupted });
    expect(result.success).toBe(false);
    expect(result.error).toContain("保存被拦截");
  });

  it("rewrites unsupported save claims when no save tool succeeded", () => {
    const text = "已成功保存到简历，打开简历页面查看。";

    expect(claimsResumeSaved(text)).toBe(true);
    expect(sanitizeUnsupportedResumeSaveClaim(text, false)).toContain("还没有真正写入简历页面");
    expect(sanitizeUnsupportedResumeSaveClaim(text, true)).toBe(text);
  });

  it("requires canonical read-back verification before reporting a section save", async () => {
    const oldCv = {
      activeVersion: "v1",
      versions: {
        v1: {
          sections: [
            { id: "skills", title: "技能", content: "旧技能清单" },
          ],
        },
      },
    };
    const nextContent = "核心能力\nAI产品全链路设计\nPrompt Engineering\nRAG知识库构建";
    const newCv = {
      activeVersion: "v1",
      versions: {
        v1: {
          sections: [
            { id: "skills", title: "技能", content: nextContent },
          ],
        },
      },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: oldCv }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: newCv }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveResumeSection.handler({
      section: "技能",
      content: nextContent,
    });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({
      ok: true,
      code: "read_back.match",
    });
  });

  it("blocks stale resume writes before PUT when base version or hash changed", async () => {
    const currentCv = {
      activeVersion: "v2",
      versions: {
        v2: {
          sections: [
            { id: "skills", title: "技能", content: "当前技能清单" },
          ],
        },
      },
    };
    const nextContent = "核心能力\nAI产品全链路设计\nPrompt Engineering\nRAG知识库构建";
    const currentHash = stableContentHash(currentCv.versions.v2);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: currentCv }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveResumeSection.handler({
      section: "技能",
      content: nextContent,
      baseVersion: "v1",
      baseHash: "fnv1a32:00000000",
    });

    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe("need_user_input");
    expect(result.error).toContain("简历已经发生变化");
    expect(result.verifiedAction?.success).toBe(false);
    expect(result.verifiedAction?.verifier.code).toBe("base_version_conflict");
    expect(result.verifiedAction?.evidence).toMatchObject({
      targetField: "skills",
      versionId: "v2",
      baseHash: currentHash,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
