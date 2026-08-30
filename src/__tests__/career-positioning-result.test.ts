import { describe, expect, it } from "vitest";
import {
  buildCareerPositioningArtifact,
  buildCareerPositioningFallback,
  isCareerPositioningConfirmation,
  isGenericCareerPositioningCompletion,
  parseCareerPositioningArtifact,
} from "@/lib/agent/career-positioning-result";

describe("career positioning result fallback", () => {
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
        { role: "user", content: "经验公式" },
        { role: "user", content: "鱼种×厚度×火力的对应表——300克黄花鱼，中火，每面3分半" },
        { role: "user", content: "4" },
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
      level: "探索/转型",
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
