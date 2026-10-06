/** spec 33 信任卡套件测试:档位换算收口 + 原语渲染(advisory 降级卡/来源卡/确认按钮)。 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  scoreBadge,
  averageScore,
  bandLabel,
  DIMENSION_LABELS,
  REJECTION_REASON_LABELS,
  AdvisoryBadge,
  SourceCard,
  ConfirmButton,
  StateChip,
} from "@/components/agent/trust";

afterEach(() => cleanup());

describe("band-scale 换算收口(spec 33)", () => {
  it("档位词与注册表逐词一致", () => {
    expect(bandLabel(0)).toBe("未作答");
    expect(bandLabel(4)).toBe("出色");
    expect(DIMENSION_LABELS.structure).toBe("结构完整度");
    expect(REJECTION_REASON_LABELS.resume_mismatch).toBe("简历不匹配");
  });

  it("scoreBadge:rubric 档位优先;/10 归一;/5 直映", () => {
    expect(scoreBadge(7, 3)).toBe("扎实 · 3/4");
    expect(scoreBadge(8)).toBe("扎实 · 3/4");
    expect(scoreBadge(3)).toBe("基础 · 2/4");
  });

  it("averageScore:0 哨兵不入均值,跨刻度不混算", () => {
    expect(averageScore([0, 6, 8])).toBe(3.5);
    expect(averageScore([undefined, 0])).toBeNull();
    expect(averageScore([3, 4])).toBe(3.5);
  });
});

describe("信任卡原语渲染", () => {
  it("AdvisoryBadge:徽章 + 原因行", () => {
    render(createElement(AdvisoryBadge, { reason: "忠实度评分 0.5 低于阈值" }));
    expect(screen.getByText("仅供参考")).toBeTruthy();
    expect(screen.getByText(/忠实度评分/)).toBeTruthy();
  });

  it("SourceCard:有值渲染,stale 附降级提示,无值不渲染", () => {
    const { rerender } = render(
      createElement(SourceCard, { label: "薪资数据来源", value: "方向参考（数据截至 2025-06，仅看量级）", stale: true }),
    );
    expect(screen.getByText(/数据截至 2025-06/)).toBeTruthy();
    expect(screen.getByText(/仅作方向参考/)).toBeTruthy();
    rerender(createElement(SourceCard, { label: "薪资数据来源", value: null }));
    expect(screen.queryByText(/数据来源/)).toBeNull();
  });

  it("StateChip:空态不渲染", () => {
    const { container } = render(createElement(StateChip, { state: null }));
    expect(container.textContent).toBe("");
    render(createElement(StateChip, { state: "不会" }));
    expect(screen.getByText("不会")).toBeTruthy();
  });

  it("ConfirmButton:三态流转", async () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      createElement(ConfirmButton, { confirmed: false, confirming: false, onConfirm }),
    );
    expect(screen.getByText("确认入账")).toBeTruthy();
    rerender(createElement(ConfirmButton, { confirmed: false, confirming: true, onConfirm }));
    expect(screen.getByText("确认中…")).toBeTruthy();
    rerender(createElement(ConfirmButton, { confirmed: true, confirming: false, onConfirm }));
    expect(screen.getByText("已确认入账")).toBeTruthy();
  });
});
