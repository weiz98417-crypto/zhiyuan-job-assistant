// @vitest-environment jsdom
/**
 * 0.11.0-D 任务 6.1 补充 — 新组件的外部行为渲染测试:
 *   - AnalystCanvas 窄屏覆盖层 vs 桌面行内(任务 2.3)
 *   - AgentRunToolbar 状态语义(waiting/paused 不谎报"处理中")
 *   - LandingCelebration 上岸时刻渲染与关闭(任务 5.1)
 */
import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { AnalystCanvas } from "@/components/agent/AnalystCanvas";
import { ReportSummaryCard, ResumeEditProposalCard } from "@/components/agent/AgentDomainCards";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("报告分析面提供完整报告入口并允许展开 A-G 详情", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { blocks_json: JSON.stringify({ a: "职位概览完整正文", g: "职位合法性完整正文" }) } }),
    }));
    render(createElement(AnalystCanvas, {
      payload: {
        kind: "report",
        reportNum: 17,
        title: "某公司 · AI 产品经理",
        blocks: { a: "职位概览正文", g: "职位合法性正文" },
      },
      onClose: () => {},
    }));
    expect(screen.getByTestId("analyst-open-report").getAttribute("href")).toBe("/evaluate/reports?report=17");
    expect(screen.getByTestId("analyst-canvas").className).toContain("lg:w-full");
    expect(screen.getByTestId("analyst-report-details").style.getPropertyValue("--color-text")).toBe("var(--color-analyst-text)");
    await waitFor(() => expect(screen.getByText("职位概览完整正文")).toBeTruthy());
    const legitimacySection = screen.getByText("G · 职位合法性").closest("details") as HTMLDetailsElement;
    expect(legitimacySection.open).toBe(false);
    fireEvent.click(screen.getByText("G · 职位合法性"));
    expect(legitimacySection.open).toBe(true);
    expect(screen.getByText("职位合法性完整正文")).toBeTruthy();
  });
});

describe("Agent 内联报告与简历提案卡", () => {
  it("报告卡展开后显示存储的 A-G 板块正文", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { blocks_json: JSON.stringify({ a: "职位概览完整正文", b: "简历匹配完整正文" }) } }),
    }));
    render(createElement(ReportSummaryCard, {
      payload: {
        reportNum: 17,
        company: "某公司",
        role: "AI 产品经理",
        blocks: { a: "职位概览截断预览", b: "简历匹配截断预览" },
      },
      content: "报告摘要",
    }));
    fireEvent.click(screen.getByRole("button", { name: /展开 A-G 详情/ }));
    await waitFor(() => expect(screen.getByText("职位概览完整正文")).toBeTruthy());
    expect(screen.getByText("简历匹配完整正文")).toBeTruthy();
    expect(screen.queryByText("职位概览截断预览")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/data/reports/17", { cache: "no-store" });
  });

  it("简历提案双栏卡使用可读宽度", () => {
    render(createElement(ResumeEditProposalCard, {
      payload: {
        type: "resume_edit_proposal",
        id: "proposal-17",
        sectionId: "experience",
        originalContent: "原始经历内容",
        proposedContent: "建议经历内容",
        status: "pending",
      },
      success: true,
      onSend: async () => {},
    }));
    const card = screen.getByTestId("resume-edit-proposal-card");
    expect(card.className).toContain("w-full");
    expect(card.className).toContain("max-w-[min(760px,96%)]");
    expect(card.querySelector('[style*="minmax(min(100%, 18rem)"]')).toBeTruthy();
    expect(screen.getByText("原始经历内容")).toBeTruthy();
    expect(screen.getByText("建议经历内容")).toBeTruthy();
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
