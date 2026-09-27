// @vitest-environment jsdom
/**
 * 0.11.0-D2 任务 1.2 — @assistant-ui/react 与 React 19.2 / jsdom 的 import 级兼容冒烟。
 *
 * 门禁：包在 React 19.2 下可导入、可 SSR（Next 16 服务端编译路径）、可客户端渲染
 * ExternalStoreRuntime 最小线程并完成 Enter 提交回路。任一失败 = 库不兼容，
 * D2 按任务 1.3 停止回报。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";

beforeAll(() => {
  // jsdom 没有 ResizeObserver；浏览器原生提供，不属于兼容性风险面。
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  // jsdom 未实现元素级 scrollTo；自动滚动在其 rAF 回调里调用。
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = (() => {}) as Element["scrollTo"];
  }
});

afterEach(() => {
  cleanup();
});

const smokeMessages: ThreadMessageLike[] = [
  { id: "u1", role: "user", content: "你好" },
  { id: "a1", role: "assistant", content: "你好，有什么可以帮你？" },
];

function SmokeShell({ onNew }: { onNew: () => Promise<void> }) {
  const runtime = useExternalStoreRuntime({
    isRunning: false,
    messages: smokeMessages,
    convertMessage: (message) => message,
    onNew: onNew,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Viewport>
          <ThreadPrimitive.Messages
            components={{ UserMessage: SmokeUserMessage, AssistantMessage: SmokeAssistantMessage }}
          />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root>
          <ComposerPrimitive.Input placeholder="输入" />
          <ComposerPrimitive.Send data-testid="send">发送</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function SmokeUserMessage() {
  return (
    <div data-testid="user-msg">
      <MessagePrimitive.Parts components={{ Text: ({ text }) => <span>{text}</span> }} />
    </div>
  );
}

function SmokeAssistantMessage() {
  return (
    <div data-testid="assistant-msg">
      <MessagePrimitive.Parts components={{ Text: ({ text }) => <span>{text}</span> }} />
    </div>
  );
}

describe("@assistant-ui/react 0.15 import-level compatibility (task 1.2)", () => {
  it("imports the ExternalStore entry surface under React 19.2", async () => {
    const mod = await import("@assistant-ui/react");
    expect(typeof mod.useExternalStoreRuntime).toBe("function");
    expect(mod.AssistantRuntimeProvider).toBeDefined();
    expect(mod.ThreadPrimitive).toBeDefined();
    expect(mod.ComposerPrimitive).toBeDefined();
    expect(mod.MessagePrimitive).toBeDefined();
  });

  it("server-renders the provider without throwing (Next 16 SSR path)", () => {
    const html = renderToString(createElement(SmokeShell, { onNew: async () => {} }));
    // 消息列表由客户端 store effect 同步；SSR 只验证编译与渲染路径可用。
    expect(html).toContain("textarea");
    expect(html).toContain("发送");
  });

  it("renders an external-store thread and submits via Enter (client smoke)", async () => {
    const seen: unknown[] = [];
    render(<SmokeShell onNew={async () => { seen.push("new"); }} />);
    const viewport = await waitFor(() => {
      const el = screen.getByTestId("assistant-msg");
      expect(el.textContent).toContain("有什么可以帮你");
      return el;
    });
    expect(viewport.textContent).toContain("你好");

    const input = screen.getByPlaceholderText("输入") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "帮我评估一个JD" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(seen).toContain("new"));
  });
});
