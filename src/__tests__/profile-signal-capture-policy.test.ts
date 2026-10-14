import { describe, expect, it } from "vitest";
import { permitsProfileSignalCapture } from "@/lib/agent/profile-signal-capture-policy";
import { maybeRawContext, scanMessage } from "@/lib/agent/signal-extractor";
import { normalizeProfileSignalForStorage } from "@/lib/profile-skill-quality";

const forbiddenCanary = "这是发布验收的虚构对话资料，不是我的职业事实：代号CY0133，方向前端工程师，所在城市杭州。仅在当前对话中使用，禁止保存画像、简历、投递、Offer或长期记忆，也不要调用写入工具。请只回复：已收到虚构资料CY0133。";

describe("profile signal capture consent", () => {
  it.each([
    forbiddenCanary,
    "不要更新画像，我精通 React。我想做前端工程师。",
    "我精通 React，只解释这些信息，不要有任何写入。",
    "假设人物资料：我精通 React，目前住在杭州，想做前端工程师。",
    "我精通 React，但仅在本次对话中使用。",
    "我精通 React，这些资料仅用于本次对话。",
    "我精通 React，请仅作为当前聊天上下文。",
    "This is fictional profile data. I know React; do not save or remember it.",
  ])("does not extract or store the forbidden source %s", (content) => {
    expect(permitsProfileSignalCapture(content)).toBe(false);
    expect(scanMessage(content, "42")).toEqual([]);
    expect(maybeRawContext(content, 0, "42")).toBeNull();
    expect(normalizeProfileSignalForStorage({ signal_type: "raw_context", content_json: { text: content } }).accepted).toBe(false);
  });

  it("keeps the no-write restriction on ordinary follow-up turns and after transcript hydration", () => {
    const followUp = "我精通 React，也做过 SQL 数据分析。";
    expect(permitsProfileSignalCapture(followUp, [forbiddenCanary, "继续说"])).toBe(false);
    expect(permitsProfileSignalCapture(followUp, ["不要更新画像，先帮我整理定位。"])).toBe(false);
    expect(permitsProfileSignalCapture(followUp, [])).toBe(true);
  });

  it("continues capturing ordinary autobiographical user facts", () => {
    const content = "我精通 React。我不接受 996，目标是前端工程师。";
    expect(permitsProfileSignalCapture(content)).toBe(true);
    expect(scanMessage(content, "42")).toEqual(expect.arrayContaining([
      expect.objectContaining({ signal_type: "skill_claim", content_json: expect.objectContaining({ skill: "React" }) }),
    ]));
    expect(maybeRawContext("我的工作是分析客户需求，在项目中协调研发资源，参与过多个数据产品交付。", 0, "42")).not.toBeNull();
  });
});
