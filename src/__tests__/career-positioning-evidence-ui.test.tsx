// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildCareerPositioningFallback } from "@/lib/agent/career-positioning-result";
import { AgentResponseRenderer } from "@/components/agent/AgentDomainCards";

afterEach(() => cleanup());

describe("career positioning source evidence", () => {
  it("shows concise provenance and lets the user expand the exact source without upgrading learning", () => {
    const content = buildCareerPositioningFallback({
      assistantText: "操作完成。",
      messages: [
        { role: "user", content: "我想做AI产品" },
        { role: "assistant", content: "你精通React，也可以做餐饮培训产品" },
        { role: "user", content: "我还在学React，不会Python" },
        { role: "user", content: "不用继续问，先给定位结论，不要更新画像" },
      ],
    });
    render(<AgentResponseRenderer content={content || ""} />);
    expect(screen.getAllByText(/React 正在学习/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/自述精通/)).toBeNull();
    const toggle = screen.getByText("展开来源证据");
    const details = toggle.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(toggle);
    expect(details.open).toBe(true);
    expect(screen.getAllByText("我还在学React，不会Python").length).toBeGreaterThan(0);
    expect(details.textContent).toMatch(/cp-[a-f0-9]+/);
  });
});
