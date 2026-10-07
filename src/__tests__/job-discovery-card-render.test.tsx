// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobDiscoveryRunCard } from "@/components/agent/AgentDomainCards";

const onSend = async () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Spec 20: JobDiscoveryRunCard render fallbacks", () => {
  it("never shows the running state for a card without a scanId", () => {
    render(<JobDiscoveryRunCard payload={{ type: "job_discovery_run", status: "pending" }} onSend={onSend} />);
    expect(screen.queryByText("岗位发现运行中")).toBeNull();
    expect(screen.getByText("岗位发现状态未知")).toBeTruthy();
  });

  it("renders the unknown state without a spinner", () => {
    render(<JobDiscoveryRunCard payload={{ type: "job_discovery_run", scanId: "s1", status: "unknown" }} onSend={onSend} />);
    expect(screen.queryByText("岗位发现运行中")).toBeNull();
    expect(screen.getByText("岗位发现状态未知")).toBeTruthy();
    expect(screen.getByText("未知")).toBeTruthy();
  });

  it("downgrades to unknown and stops the spinner when status polling fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Scan not found" }), { status: 404 })));

    render(<JobDiscoveryRunCard payload={{ type: "job_discovery_run", scanId: "s404", status: "running" }} onSend={onSend} />);
    await waitFor(() => expect(screen.getByText("岗位发现状态未知")).toBeTruthy());
    expect(screen.queryByText("岗位发现运行中")).toBeNull();
    expect(screen.getByText(/Scan not found/)).toBeTruthy();
  });

  it("keeps the running presentation for an in-flight card with a scanId", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { status: "running" } }), { status: 200 })));

    render(<JobDiscoveryRunCard payload={{ type: "job_discovery_run", scanId: "s-live", status: "running" }} onSend={onSend} />);
    expect(screen.getByText("岗位发现运行中")).toBeTruthy();
  });
});
