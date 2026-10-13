// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthGate from "@/components/shell/AuthGate";
import { getBrowserOwner, setBrowserOwner } from "@/lib/browser-owner";

const navigation = vi.hoisted(() => ({ pathname: "/settings" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/lib/security/csrf-fetch", () => ({ installCsrfFetch: vi.fn() }));
vi.mock("@/components/shell/WorkbenchShell", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

beforeEach(() => {
  navigation.pathname = "/settings";
  localStorage.clear();
  setBrowserOwner(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("authenticated page mounting", () => {
  it("mounts business content only after identity validation and treats an unavailable identity service as an error", async () => {
    let complete: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; })));
    render(<AuthGate><p>PRIVATE_BUSINESS_CONTENT</p></AuthGate>);
    expect(screen.queryByText("PRIVATE_BUSINESS_CONTENT")).toBeNull();
    await act(async () => { complete(Response.json({ error: "unavailable" }, { status: 503 })); });
    expect((await screen.findByRole("alert")).textContent).toContain("账号验证暂不可用");
    expect(screen.queryByText("PRIVATE_BUSINESS_CONTENT")).toBeNull();
    expect(getBrowserOwner()).toBeNull();
  });

  it("discards a late identity response and unmounts the old account when ownership changes", async () => {
    let complete: (response: Response) => void = () => {};
    const network = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "gate-A" }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal("fetch", network);
    render(<AuthGate><p>A_PRIVATE</p></AuthGate>);
    expect(await screen.findByText("A_PRIVATE")).toBeTruthy();
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    act(() => { setBrowserOwner("gate-B"); });
    expect(screen.queryByText("A_PRIVATE")).toBeNull();
    await act(async () => { complete(Response.json({ id: "gate-A" })); });
    expect(getBrowserOwner()?.ownerId).toBe("gate-B");
    expect(screen.queryByText("A_PRIVATE")).toBeNull();
  });
});
