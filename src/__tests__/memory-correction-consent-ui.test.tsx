// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemoryPage from "@/app/memory/page";

describe("memory correction purpose consent", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each([false, true])("only resubmits the exact correction after explicit purpose consent: %s", async consent => {
    const requests: Array<Record<string, unknown>> = [];
    const facts = [{ id: 7, canonicalText: "我希望建议简短", subject: "job_search", predicate: "profile_preference", partition: "core", sourceType: "user_explicit_memory", sourceId: "fixture", validAt: "2026-10-14T00:00:00Z" }];
    vi.stubGlobal("fetch", vi.fn(async (resource: string, options?: RequestInit) => {
      if (resource === "/api/memory/candidates") {
        return new Response(JSON.stringify({ success: true, data: { facts, candidates: [], discovery: { enabled: true, noticeAcknowledged: true } } }), { status: 200 });
      }
      if (resource === "/api/memory/correction") {
        const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
        requests.push(body);
        return body.confirmedJobUse === true
          ? new Response(JSON.stringify({ success: true, data: { recorded: [{ factId: 8, decision: "UPDATE" }] } }), { status: 200 })
          : new Response(JSON.stringify({ success: false, code: "sensitive_job_use_confirmation_required" }), { status: 422 });
      }
      throw new Error("Unexpected route " + resource);
    }));
    vi.spyOn(window, "prompt").mockReturnValueOnce("我期望30K").mockReturnValueOnce("这是我当前的求职目标");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(consent);
    render(<MemoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "纠正" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(requests).toHaveLength(consent ? 2 : 1));
    expect(requests[0]).toEqual({ targetFactId: 7, canonicalText: "我期望30K", sourceText: "这是我当前的求职目标", object: { value: "我期望30K" }, confirmedJobUse: false });
    if (consent) {
      expect(requests[1]).toEqual({ ...requests[0], confirmedJobUse: true });
      await screen.findByText("已写入纠正后的事实，旧事实已失效");
    }
  });

  it("distinguishes a failed read from empty memory and restores the actual collections after retry", async () => {
    const candidates = [1, 2].map(id => ({ id, canonicalText: `待确认事实${id}`, sensitivity: "none", sourceType: "conversation_message", sourceId: `candidate-${id}`, expiresAt: "2026-11-14T00:00:00Z" }));
    const facts = Array.from({ length: 7 }, (_, index) => ({ id: index + 10, canonicalText: `已确认事实${index}`, subject: "job_search", predicate: "profile_preference", partition: "private", sourceType: "user_explicit_memory", sourceId: `fact-${index}`, validAt: "2026-10-14T00:00:00Z" }));
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (resource: string) => {
      requests.push(resource);
      return requests.length === 1
        ? new Response(JSON.stringify({ success: false, error: "Memory operation failed" }), { status: 503 })
        : new Response(JSON.stringify({ success: true, data: { facts, candidates, discovery: { enabled: true, noticeAcknowledged: true } } }), { status: 200 });
    }));
    render(<MemoryPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("记忆读取暂不可用");
    expect(screen.queryByText("待确认候选（0）")).toBeNull();
    expect(screen.queryByText("已生效事实（0）")).toBeNull();
    expect(screen.queryByText("暂无待确认候选。")).toBeNull();
    expect(screen.queryByText("暂无可显示的私人事实。")).toBeNull();
    expect(screen.queryByRole("button", { name: "确认记住" })).toBeNull();
    expect(screen.queryByRole("button", { name: "纠正" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试读取记忆" }));
    await screen.findByText("待确认候选（2）");
    await screen.findByText("已生效事实（7）");
    expect(screen.getAllByRole("button", { name: "确认记住" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "纠正" })).toHaveLength(7);
    expect(screen.getByText("已确认事实6")).toBeTruthy();
    expect(screen.getByText("分区：private · 来源：user_explicit_memory / fact-6")).toBeTruthy();
    expect(requests).toEqual(["/api/memory/candidates", "/api/memory/candidates"]);
  });
});
