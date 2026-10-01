// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ElementInlineCitation, ElementReasoningCard, ElementTaskCard, ElementToolCard } from "@/components/design/elements";
import { RunGateCard } from "@/components/agent/AgentDomainCards";

afterEach(() => cleanup());

describe("Spec 17: paper design elements", () => {
  it("renders tool card states with visible status", () => {
    render(<ElementToolCard label="已读取求职画像" status="success" />);
    expect(screen.getByText("已读取求职画像")).toBeTruthy();
    expect(screen.getByText("完成")).toBeTruthy();

    cleanup();
    render(<ElementToolCard label="已完成搜索" status="failed" />);
    expect(screen.getByText("失败")).toBeTruthy();

    cleanup();
    render(<ElementToolCard label="正在读取文件" status="running" />);
    expect(screen.getByText("进行中")).toBeTruthy();
  });

  it("renders task progress items", () => {
    render(<ElementTaskCard title="简历修改事务" items={[
      { label: "起草 section patch", status: "success" },
      { label: "等待批准", status: "running" },
    ]} />);
    expect(screen.getByText("简历修改事务")).toBeTruthy();
    expect(screen.getByText("起草 section patch")).toBeTruthy();
    expect(screen.getByText("等待批准")).toBeTruthy();
  });

  it("hides the reasoning card when the summary is empty and shows the summary otherwise", () => {
    const { container: empty } = render(<ElementReasoningCard summary="  " />);
    expect(empty.textContent).not.toContain("正在想什么");

    cleanup();
    render(<ElementReasoningCard summary="正在比较两段经历的量化表述" />);
    expect(screen.getByText("正在想什么（摘要）")).toBeTruthy();
  });

  it("renders inline citation chips with an optional link", () => {
    render(<ElementInlineCitation source="JD 原文第 2 段" href="https://example.com/jd" />);
    expect(screen.getByText("JD 原文第 2 段")).toBeTruthy();
    expect(screen.getByRole("link")).toBeTruthy();
  });
});

describe("Spec 17: RunGateCard three states", () => {
  const basePayload = {
    gateId: "gate-1",
    status: "pending",
    request: { userVisibleName: "保存简历修改", toolName: "save_resume_section" },
  };

  it("shows approve/deny buttons while pending", () => {
    render(<RunGateCard payload={basePayload} onDecision={async () => {}} />);
    expect(screen.getByText("需要你的批准 · 保存简历修改")).toBeTruthy();
    expect(screen.getByText("批准并应用")).toBeTruthy();
    expect(screen.getByText("拒绝")).toBeTruthy();
  });

  it("shows the approved state without buttons", () => {
    render(<RunGateCard payload={{ ...basePayload, status: "approved" }} />);
    expect(screen.getByText("已批准 · 保存简历修改")).toBeTruthy();
    expect(screen.getByText("已批准")).toBeTruthy();
    expect(screen.queryByText("批准并应用")).toBeNull();
  });

  it("shows the denied state without buttons", () => {
    render(<RunGateCard payload={{ ...basePayload, status: "denied" }} />);
    expect(screen.getByText("已拒绝 · 保存简历修改")).toBeTruthy();
    expect(screen.queryByText("批准并应用")).toBeNull();
  });
});
