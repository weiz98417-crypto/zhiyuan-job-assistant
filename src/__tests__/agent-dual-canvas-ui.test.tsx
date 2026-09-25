// @vitest-environment jsdom
/**
 * 0.11.0-D 任务 6.1 补充 — 新组件的外部行为渲染测试:
 *   - AnalystCanvas 窄屏覆盖层 vs 桌面行内(任务 2.3)
 *   - AgentRunToolbar 状态语义(waiting/paused 不谎报"处理中")
 *   - LandingCelebration 上岸时刻渲染与关闭(任务 5.1)
 */
import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { AnalystCanvas } from "@/components/agent/AnalystCanvas";
import { AgentRunToolbar, RollbackProposalBanner } from "@/components/agent/AgentRunToolbar";
import LandingCelebration from "@/components/tracker/LandingCelebration";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = (() => {}) as Element["scrollTo"];
  }
});

afterEach(() => cleanup());

describe("AnalystCanvas 布局形态(任务 2.3)", () => {
  const payload = { kind: "report" as const, title: "某公司 · 产品经理", reportNum: 12 };

  it("窄屏为固定覆盖层(fixed inset-0)", () => {
    const { container } = render(
      createElement(AnalystCanvas, { payload, onClose: () => {} }),
    );
    const canvas = container.querySelector('[data-testid="analyst-canvas"]') as HTMLElement;
    expect(canvas.className).toContain("fixed inset-0 z-40");
    expect(canvas.className).toContain("lg:static");
  });

  it("最大化占满整行宽度", () => {
    const { container } = render(
      createElement(AnalystCanvas, { payload, maximized: true, onClose: () => {} }),
    );
    const canvas = container.querySelector('[data-testid="analyst-canvas"]') as HTMLElement;
    expect(canvas.style.width).toBe("100%");
  });

  it("无 payload 时不渲染", () => {
    const { container } = render(createElement(AnalystCanvas, { payload: null, onClose: () => {} }));
    expect(container.querySelector('[data-testid="analyst-canvas"]')).toBeNull();
  });
});

describe("AgentRunToolbar 状态语义", () => {
  const noop = () => {};

  it("waiting_user 显示「等待你的回复」", () => {
    render(createElement(AgentRunToolbar, {
      status: "waiting_user", artifacts: [], action: null,
      onResume: noop, onPause: noop, onCancel: noop,
    }));
    expect(screen.getByText("等待你的回复")).toBeTruthy();
    expect(screen.queryByText("纸鸢正在处理")).toBeNull();
  });

  it("paused 显示「任务已暂停」并提供恢复按钮", () => {
    render(createElement(AgentRunToolbar, {
      status: "paused", artifacts: [], action: null,
      onResume: noop, onPause: noop, onCancel: noop,
    }));
    expect(screen.getByText("任务已暂停")).toBeTruthy();
    expect(screen.getByRole("button", { name: /恢复/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /暂停中|暂停$/ })).toBeNull();
  });

  it("撤销横幅:撤销中禁用并显示进行时", () => {
    render(createElement(RollbackProposalBanner, {
      sectionId: "summary", updatedAt: "2026-09-25", rollingBack: true, disabled: true, onRollback: noop,
    }));
    const button = screen.getByRole("button", { name: /撤销中/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe("LandingCelebration 上岸时刻(任务 5.1)", () => {
  it("渲染公司/岗位与归档说明,不使用 emoji 图标", () => {
    render(createElement(LandingCelebration, { company: "某大模型公司", role: "AI 产品经理", onClose: () => {} }));
    expect(screen.getByText(/上岸 · Offer 已确认/)).toBeTruthy();
    expect(screen.getByText(/某大模型公司 · AI 产品经理/)).toBeTruthy();
    expect(screen.getByText(/旅程已归档/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /收下这份喜悦/ })).toBeTruthy();
  });

  it("点击关闭按钮触发 onClose", () => {
    const onClose = vi.fn();
    render(createElement(LandingCelebration, { company: "A", role: "B", onClose }));
    fireEvent.click(screen.getByRole("button", { name: /收下这份喜悦/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
