// @vitest-environment jsdom
/**
 * 0.11.0-D2 — assistant-ui 新壳的外部行为与交互测试。
 *
 * 覆盖(proposal 测试决策):
 * - convertTranscript 映射(工具卡/主责标签/data parts/过滤规则)
 * - 审批卡批准/拒绝触发正确回调;Enter 发送;Shift+Enter 不发送
 * - 流式中的运行态;停止按钮;空态
 */
import { describe, expect, it, beforeAll, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import {
  convertTranscript,
  isRunActive,
  isProcessEvent,
  appendMessageToSubmission,
  type AgentTranscriptItem,
} from "@/components/agent/assistant-chat";
import AgentChat from "@/components/agent/AgentChat";
import type { AgentMessage } from "@/types";

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

// vitest 未启用 globals,RTL 不会自动注册 cleanup;显式清理避免跨用例 DOM 污染。
afterEach(() => {
  cleanup();
});

const userMsg = (content: string, extra: Partial<AgentMessage> = {}): AgentMessage => ({
  role: "user",
  content,
  timestamp: "2026-09-25T10:00:00.000Z",
  ...extra,
});

const assistantMsg = (content: string, extra: Partial<AgentMessage> = {}): AgentMessage => ({
  role: "assistant",
  content,
  timestamp: "2026-09-25T10:00:01.000Z",
  ...extra,
});

const toolMsg = (toolName: string, uiPayload: Record<string, unknown>, extra: Partial<AgentMessage> = {}): AgentMessage => ({
  role: "tool",
  toolName,
  content: "已完成处理",
  toolResult: { kind: "card", toolName, status: "success", label: "已完成处理", summary: "已完成处理", uiPayload },
  timestamp: "2026-09-25T10:00:02.000Z",
  ...extra,
});

describe("convertTranscript(任务 2.1)", () => {
  it("maps user/assistant/tool items; tool cards ride as tool-call parts with the safe payload", () => {
    const items: AgentMessage[] = [
      userMsg("帮我评估一个JD"),
      assistantMsg("好的，我来分析。"),
      toolMsg("evaluate_jd", { type: "jd_report", reportId: "r1" }),
    ];
    const converted = convertTranscript(items);
    expect(converted).toHaveLength(3);
    expect(converted[0]).toMatchObject({ role: "user", content: [{ type: "text", text: "帮我评估一个JD" }] });
    expect(converted[1]).toMatchObject({ role: "assistant", content: [{ type: "text", text: "好的，我来分析。" }] });
    expect(converted[2]?.role).toBe("assistant");
    const parts = converted[2]?.content as Array<{ type: string; toolName?: string; result?: unknown }>;
    expect(parts[0]?.type).toBe("tool-call");
    expect(parts[0]?.toolName).toBe("evaluate_jd");
    expect((parts[0]?.result as { uiPayload?: { type?: string } }).uiPayload?.type).toBe("jd_report");
  });

  it("keeps old-shell filters: empty assistant lines and evaluate_jd_full tool lines are hidden", () => {
    const items: AgentMessage[] = [
      userMsg("hi"),
      assistantMsg("   "),
      toolMsg("evaluate_jd_full", { type: "jd_report" }),
      assistantMsg("回复正文"),
    ];
    const converted = convertTranscript(items);
    expect(converted).toHaveLength(2);
  });

  it("zero-flicker: streamed content growth keeps stable message ids (index-based fallbacks)", () => {
    const before = convertTranscript([userMsg("hi"), assistantMsg("部分")], { idPrefix: "s7" });
    const after = convertTranscript([userMsg("hi"), assistantMsg("部分,补全后的更长回复")], { idPrefix: "s7" });
    expect(before[0]?.id).toBe(after[0]?.id);
    expect(before[1]?.id).toBe(after[1]?.id);
    expect(after[1]?.id).toBeTruthy();
  });

  it("renders the delegation track card from subagent payloads", async () => {
    const messages: AgentMessage[] = [
      userMsg("深度调研这家公司"),
      toolMsg("delegate_research", {
        type: "delegation",
        delegationId: "d1",
        agentId: "offer",
        goal: "调研团队与融资",
        state: "completed",
        findings: "B轮,团队 80 人",
        keyPoints: ["B轮", "团队 80 人"],
      }),
    ];
    render(ShellHarness({ messages }));
    await waitFor(() => expect(screen.getByText(/调研团队与融资/)).toBeTruthy());
  });

  it("attaches the agent label on agent switch and after each user turn (old-shell semantics)", () => {
    const items: AgentMessage[] = [
      userMsg("第一问"),
      assistantMsg("面试教练回答", { agent_id: "interview" }),
      assistantMsg("继续回答", { agent_id: "interview" }),
      userMsg("第二问"),
      assistantMsg("再次自我介绍", { agent_id: "interview" }),
    ];
    const converted = convertTranscript(items);
    const metaOf = (i: number) => converted[i]?.metadata?.custom as { agentLabel?: string } | undefined;
    expect(metaOf(1)?.agentLabel).toBe("面试教练");
    expect(metaOf(2)?.agentLabel).toBeUndefined();
    expect(metaOf(4)?.agentLabel).toBe("面试教练");
  });

  it("maps dialect event entries to whitelisted data parts (任务 2.1: step/subagent/agent_switch/persist_done)", () => {
    const event = {
      timestamp: "2026-09-25T10:00:03.000Z",
      type: "persist_done" as const,
      data: { reportNum: 42, company: "Acme", role: "PM", score: 4.2, secretInternal: "leak" },
    };
    expect(isProcessEvent(event)).toBe(true);
    const converted = convertTranscript([userMsg("hi"), event]);
    const parts = converted[1]?.content as Array<{ type: string; data: Record<string, unknown> }>;
    expect(parts[0]?.type).toBe("data-persist_done");
    expect(parts[0]?.data).toEqual({ reportNum: 42, company: "Acme", role: "PM", score: 4.2 });
    expect(Object.keys(parts[0]?.data ?? {})).not.toContain("secretInternal");
  });

  it("isRunning = streaming && phase 活跃(任务 2.2)", () => {
    expect(isRunActive(true, "executing")).toBe(true);
    expect(isRunActive(true, null)).toBe(false);
    expect(isRunActive(true, "done")).toBe(false);
    expect(isRunActive(false, "executing")).toBe(false);
  });

  it("extracts text and images from composer submissions (onNew → onSend)", () => {
    const submission = appendMessageToSubmission({
      parentId: null,
      sourceId: undefined,
      role: "user" as const,
      content: [
        { type: "text" as const, text: "看这张图" },
        { type: "image" as const, image: "data:image/png;base64,AAAA" },
      ],
      createdAt: new Date(),
    } as never);
    expect(submission.content).toBe("看这张图");
    expect(submission.images).toEqual(["data:image/png;base64,AAAA"]);
  });
});

function ShellHarness(props: {
  messages?: AgentMessage[];
  streaming?: boolean;
  phase?: Parameters<typeof isRunActive>[1];
  onSend?: (content: string, images?: string[]) => Promise<void>;
  onGateDecision?: (gateId: string, decision: "approved" | "denied") => Promise<void>;
  onStop?: () => void;
}) {
  return createElement(AgentChat, {
    currentSessionId: 7,
    messages: props.messages ?? [],
    streaming: props.streaming ?? false,
    phase: props.phase ?? null,
    suggestions: [{ icon: null, label: "评估JD", prompt: "评估这个JD与简历的匹配度" }],
    onSend: props.onSend ?? (async () => {}),
    onGateDecision: props.onGateDecision,
    onStop: props.onStop,
    emptyState: createElement("div", { "data-testid": "empty-state" }, "空态"),
  });
}

describe("AgentChat 新壳外部行为", () => {
  it("renders user bubbles, assistant text and domain tool cards from a merged transcript", async () => {
    const messages: AgentMessage[] = [
      userMsg("帮我把简历导出"),
      assistantMsg("好的,已开始处理。"),
      toolMsg("export_file", { type: "export_artifact", downloadUrl: "/f/file.md", filename: "简历.md" }),
      toolMsg("delegate_research", { type: "handoff", agentId: "offer", fromTask: "评估", toTask: "谈判" }),
    ];
    render(ShellHarness({ messages }));
    await waitFor(() => expect(screen.getByText("帮我把简历导出")).toBeTruthy());
    expect(screen.getByText(/好的,已开始处理/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/下载 简历\.md/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/主责交接/)).toBeTruthy());
  });

  it("renders the approval card and routes approve/deny to onGateDecision (任务 3.2)", async () => {
    const onGateDecision = vi.fn(async () => {});
    const messages: AgentMessage[] = [
      userMsg("保存参考简历"),
      toolMsg("save_reference_resume", {
        type: "run_gate",
        gateId: "gate-1",
        status: "pending",
        request: { userVisibleName: "保存优秀参考简历" },
      }),
    ];
    render(ShellHarness({ messages, onGateDecision }));
    await waitFor(() => expect(screen.getByText("保存优秀参考简历")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /批准并继续/ }));
    await waitFor(() => expect(onGateDecision).toHaveBeenCalledWith("gate-1", "approved"));

    await waitFor(() => expect(screen.getByRole("button", { name: "拒绝" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    await waitFor(() => expect(onGateDecision).toHaveBeenCalledWith("gate-1", "denied"));
  });

  it("resolved gate cards lose their decision buttons", async () => {
    const messages: AgentMessage[] = [
      userMsg("保存参考简历"),
      toolMsg("save_reference_resume", {
        type: "run_gate",
        gateId: "gate-2",
        status: "denied",
        request: { userVisibleName: "保存优秀参考简历" },
      }),
    ];
    render(ShellHarness({ messages }));
    await waitFor(() => expect(screen.getByText("已拒绝")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /批准并继续/ })).toBeNull();
  });

  it("Enter submits through the composer; Shift+Enter does not (任务 3.3)", async () => {
    const onSend = vi.fn(async () => {});
    render(ShellHarness({ messages: [assistantMsg("你好")], onSend }));
    const input = await waitFor(() => {
      const el = screen.getByPlaceholderText(/告诉纸鸢你需要什么/) as HTMLTextAreaElement;
      return el;
    });
    fireEvent.change(input, { target: { value: "评估这个岗位" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("评估这个岗位", undefined));

    fireEvent.change(input, { target: { value: "第二句" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("streams: composer shows running placeholder, stop routes to onStop", async () => {
    const onStop = vi.fn();
    const messages: AgentMessage[] = [
      userMsg("hi"),
      assistantMsg("正在回答"),
    ];
    render(ShellHarness({ messages, streaming: true, phase: "responding", onStop }));
    const input = await waitFor(() => screen.getByPlaceholderText("AI 回复中...") as HTMLTextAreaElement);
    expect(input).toBeTruthy();
    const stop = await waitFor(() => screen.getByRole("button", { name: "停止回复" }));
    fireEvent.click(stop);
    await waitFor(() => expect(onStop).toHaveBeenCalled());
  });

  it("shows the empty state when the conversation has no user turn yet", async () => {
    render(ShellHarness({ messages: [] }));
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("评估JD")).toBeTruthy());
  });
});
