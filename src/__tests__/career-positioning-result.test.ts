import { describe, expect, it } from "vitest";
import {
  buildCareerPositioningArtifact,
  buildCareerPositioningFallback,
  isCareerPositioningConfirmation,
  isGenericCareerPositioningCompletion,
  parseCareerPositioningArtifact,
} from "@/lib/agent/career-positioning-result";

describe("career positioning result fallback", () => {
  it("does not reload legacy artifacts or artifacts with non-user evidence for confirmation", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "我想做AI产品" },
      { role: "user", content: "我在学React" },
      { role: "user", content: "阶段性结论" },
    ])!;
    expect(parseCareerPositioningArtifact(JSON.stringify({ ...artifact, sourceEvidence: undefined }))).toBeNull();
    expect(parseCareerPositioningArtifact(JSON.stringify({ ...artifact, sourceEvidence: [] }))).toBeNull();
    expect(parseCareerPositioningArtifact(JSON.stringify({
      ...artifact, sourceEvidence: [{ ...artifact.sourceEvidence[0], category: "assistant_generated" }],
    }))).toBeNull();
  });

  it("uses the user's learning statement without promoting assistant claims into skills or experience", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "我想做AI产品，先帮我定位" },
      { role: "assistant", content: "你精通React和SQL，有烤鱼经验，可以做培训学校MVP。" },
      { role: "user", content: "我现在还在学React，SQL也是在学，不会Python" },
      { role: "user", content: "不要更新画像，先给我阶段性结论" },
    ]);
    expect(artifact?.targetRoles[0].role).toBe("AI 产品经理");
    expect(artifact?.positioningSummary).toContain("推断");
    expect(artifact?.evidence.join(" ")).toContain("React");
    expect(artifact?.evidence.join(" ")).toContain("学习");
    expect(JSON.stringify(artifact)).not.toMatch(/精通|烤鱼|餐饮培训|硬技能/);
    expect(artifact?.sourceEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "user_stated", sourceQuote: "我现在还在学React，SQL也是在学，不会Python" }),
    ]));
  });

  it.each([
    "我不精通React，也没有烤鱼经验",
    "我朋友精通React，之前经营烤鱼店",
    "示例：我精通React，我有烤鱼经验",
    "示例：我现在精通React，我有烤鱼经验",
    "引用他的原话：“我现在精通React，我实际经营烤鱼店”",
    "假设我精通React，也做过烤鱼培训",
    "引用他的原话：我精通React，我经营过烤鱼店",
    "你说的“我精通React、做过烤鱼”不是我的情况",
    "我没精通React",
    "我没学会React",
    "我没做过React项目",
    "我希望未来能掌握React",
    "我的计划是精通React",
    "我想用React做一个项目",
    "我想学会React",
    "我没经营过烤鱼店",
    "我想经营餐饮店",
    "我不是学的小龙虾烧烤专业",
  ])("does not promote denied, third-party or example content into personal positioning: %s", (content) => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "帮我做职业定位" },
      { role: "assistant", content: "比如精通React，或餐饮培训学校的软件" },
      { role: "user", content },
      { role: "user", content: "先给阶段性结论，不要保存" },
    ]);
    expect(artifact?.targetRoles[0].role).toBe("职业方向探索（待验证）");
    expect(artifact?.positioningSummary).not.toMatch(/自述精通|餐饮场景|React 前端工程师/);
    expect(artifact?.evidence.join(" ")).not.toMatch(/自述精通|自述餐饮/);
    expect(artifact?.nextActions.join(" ")).not.toMatch(/烤鱼|餐饮培训|保存|写入/);
  });

  it("uses the latest correction with its exact source instead of an earlier skill claim", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", itemId: "turn-1", content: "我精通React，我不接受996" },
      { role: "assistant", content: "你的React技能可以作为硬优势" },
      { role: "user", itemId: "turn-2", content: "纠正一下，我不是精通React，我只是刚开始学React" },
      { role: "user", itemId: "turn-3", content: "我现在可以接受996，先给结论" },
    ]);
    expect(artifact?.targetRoles[0].role).toBe("职业方向探索（待验证）");
    expect(artifact?.evidence.join(" ")).toContain("React 正在学习");
    expect(artifact?.evidence.join(" ")).not.toContain("不接受 996");
    expect(artifact?.sourceEvidence.find((item) => item.topic === "skill:React")).toMatchObject({
      sourceTurnId: "turn-2", sourceQuote: "纠正一下，我不是精通React，我只是刚开始学React",
    });
  });

  it("replaces a withdrawn example with the actual learning clause from the same correction turn", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", itemId: "old-claim", content: "我精通React" },
      { role: "user", itemId: "correction", content: "纠正，刚才是示例，我其实只在学React" },
      { role: "user", content: "先给结论" },
    ])!;
    expect(artifact.targetRoles[0].role).toBe("职业方向探索（待验证）");
    expect(artifact.sourceEvidence).toEqual([expect.objectContaining({
      claim: "React 正在学习", sourceTurnId: "correction", sourceQuote: "纠正，刚才是示例，我其实只在学React",
    })]);
  });

  it("withdraws the earlier example facts even when the correction supplies no replacement skills", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", itemId: "goal", content: "我想做AI产品" },
      { role: "user", itemId: "old-claim", content: "我精通React，我之前经营烤鱼店" },
      { role: "user", itemId: "correction", content: "纠正一下，刚才是示例，不是我的实际经历" },
    ])!;
    expect(artifact.targetRoles[0].role).toBe("AI 产品经理");
    expect(artifact.sourceEvidence.map((item) => item.topic)).toEqual(["goal:ai_product"]);
    expect(artifact.evidence.join(" ")).not.toMatch(/React|餐饮/);
  });

  it("limits example withdrawal to the referenced turn and preserves unrelated earlier personal skills", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", itemId: "personal-sql", content: "我熟练使用SQL" },
      { role: "user", itemId: "old-example", content: "我精通React" },
      { role: "user", itemId: "correction", content: "纠正，刚才是示例，我其实只在学React" },
    ])!;
    expect(artifact.sourceEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic: "skill:SQL", claim: "自述熟练使用 SQL", sourceTurnId: "personal-sql" }),
      expect.objectContaining({ topic: "skill:React", claim: "React 正在学习", sourceTurnId: "correction" }),
    ]));
  });

  it("keeps quoted and third-party clauses out while reading an explicitly personal correction in the same turn", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "帮我定位" },
      { role: "user", content: "引用他的原话：我精通React，SQL也熟练。我实际不会React，我现在在学SQL" },
      { role: "user", content: "先给结论" },
    ])!;
    expect(artifact.targetRoles[0].role).toBe("职业方向探索（待验证）");
    expect(artifact.sourceEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic: "skill:React", claim: "React 尚未掌握" }),
      expect.objectContaining({ topic: "skill:SQL", claim: "SQL 正在学习" }),
    ]));
    expect(artifact.evidence.join(" ")).not.toMatch(/自述精通|自述熟练/);
  });

  it("binds a numeric scene selection only to the immediately preceding explicit options", () => {
    const base = [
      { role: "user" as const, content: "我想做AI产品" },
      { role: "user" as const, content: "我之前从事烤鱼工作" },
    ];
    const unbound = buildCareerPositioningArtifact([...base,
      { role: "assistant", content: "餐饮培训学校也许是一个场景" },
      { role: "user", content: "4" },
    ]);
    expect(unbound?.sourceEvidence.some((item) => item.topic === "scenario:training_school")).toBe(false);
    const bound = buildCareerPositioningArtifact([...base,
      { role: "assistant", itemId: "scene-question", content: "选择第一目标用户：\n1. 连锁餐厅\n2. 烤炉厂家\n3. 个人学员\n4. 餐饮培训学校" },
      { role: "user", itemId: "scene-answer", content: "4" },
    ]);
    expect(bound?.sourceEvidence.find((item) => item.topic === "scenario:training_school")).toMatchObject({
      sourceQuote: "4", sourceTurnId: "scene-answer", contextQuote: expect.stringContaining("4. 餐饮培训学校"),
    });
    expect(bound?.targetScenario).toContain("假设");
    expect(bound?.targetScenario).toContain("餐饮培训学校");
  });

  it("starts the first positioning stage when the model only loads the framework tool", () => {
    const result = buildCareerPositioningFallback({
      assistantText: "",
      toolResult: {
        name: "self_positioning",
        success: true,
        result: "4 阶段引导框架已加载，请引导用户从第一阶段开始。",
        data: { phases: ["第一阶段：设定期望（1-2 轮）"] },
      },
      messages: [
        { role: "user", content: "帮我做自我定位" },
      ],
    });

    expect(result).toContain("先对齐你的期望");
    expect(result).toContain("目标岗位");
    expect(result).toContain("排除");
    expect(result).toContain("行动方案");
    expect(result).not.toContain("请引导用户");
  });

  it("treats generic completion text as unsafe for self-positioning final replies", () => {
    expect(isGenericCareerPositioningCompletion("操作完成。")).toBe(true);
    expect(isGenericCareerPositioningCompletion("画像挖掘完成！定位已保存！画像已更新。可在 /profile 页面查看。")).toBe(true);
    expect(isGenericCareerPositioningCompletion("你的定位假设是 AI 产品经理。")).toBe(false);
  });

  it("turns the grilled-fish AI product conversation into a positioning result", () => {
    const result = buildCareerPositioningFallback({
      assistantText: "操作完成。",
      toolResult: {
        name: "mine_profile",
        success: true,
        result: "画像挖掘完成！定位已保存！",
        data: { done: true },
      },
      messages: [
        { role: "user", content: "我想找工作" },
        { role: "user", content: "我之前是卖鱼的，学的是小龙虾烧烤专业" },
        { role: "user", content: "我想去做AI产品" },
        { role: "user", content: "做自动烧烤的软件" },
        { role: "user", content: "带徒弟的时候很烦" },
        { role: "assistant", content: "餐饮培训学校——教学生的时候有个量化工具" },
        { role: "user", content: "我整理了烤鱼经验公式" },
        { role: "user", content: "鱼种×厚度×火力的对应表——300克黄花鱼，中火，每面3分半" },
        { role: "user", content: "我选择餐饮培训学校作为目标用户" },
        { role: "user", content: "不，我就要卖软件" },
        { role: "user", content: "C" },
      ],
    });

    expect(result).toContain("定位假设");
    expect(result).toContain("烤鱼经验公式化");
    expect(result).toContain("餐饮培训学校");
    expect(result).toContain("MVP");
    expect(result).toContain("确认");
    expect(result).toContain("求职画像");
  });

  it("builds a structured artifact that can be stored in guided session state", () => {
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "我想去做AI产品" },
      { role: "user", content: "做自动烧烤的软件" },
      { role: "user", content: "我最强的是烤鱼经验公式，鱼种×厚度×火力" },
      { role: "user", content: "带徒弟的时候很烦，尤其不知道什么时候翻面" },
      { role: "user", content: "餐饮培训学校会买单" },
    ]);

    expect(artifact?.targetRoles[0]).toMatchObject({
      role: "AI 产品经理（餐饮智能化/自动烧烤软件方向）",
      level: "待验证",
    });
    expect(artifact?.roleSignal).toMatchObject({
      role: "AI 产品经理（餐饮智能化/自动烧烤软件方向）",
    });

    const parsed = parseCareerPositioningArtifact(JSON.stringify(artifact));
    expect(parsed?.kind).toBe("career_positioning");
    expect(parsed?.targetRoles[0]?.role).toBe(artifact?.targetRoles[0]?.role);
  });

  it("recognizes short confirmation replies for saving positioning results", () => {
    expect(isCareerPositioningConfirmation("确认")).toBe(true);
    expect(isCareerPositioningConfirmation("就这个")).toBe(true);
    expect(isCareerPositioningConfirmation("我想调整一下目标场景")).toBe(false);
  });
});
