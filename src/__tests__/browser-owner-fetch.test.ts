import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("browser authenticated request ownership", () => {
  it("does not let a late identity 401 log out the newly verified account", async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return entries.size; },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    let complete: (response: Response) => void = () => {};
    const network = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const browser = {
      fetch: network as typeof fetch,
      location: { href: "https://example.test/settings", origin: "https://example.test", pathname: "/settings", replace: vi.fn() },
    };
    vi.stubGlobal("window", browser);
    const { installCsrfFetch } = await import("@/lib/security/csrf-fetch");
    const { getBrowserOwner, setBrowserOwner } = await import("@/lib/browser-owner");
    installCsrfFetch();
    setBrowserOwner("request-A");
    const response = browser.fetch("/api/users/me");
    setBrowserOwner("request-B");
    complete(Response.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await response).status).toBe(401);
    expect(getBrowserOwner()?.ownerId).toBe("request-B");
    expect(network).toHaveBeenCalledTimes(1);
    expect(browser.location.replace).not.toHaveBeenCalled();
  });

  it("rejects body consumption and stream chunks after account switching", async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return entries.size; },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    const network = vi.fn(async () => new Response(JSON.stringify({ private: "A_PRIVATE" })));
    const browser = {
      fetch: network as typeof fetch,
      location: { href: "https://example.test/settings", origin: "https://example.test", pathname: "/settings" },
    };
    vi.stubGlobal("window", browser);
    const { installCsrfFetch } = await import("@/lib/security/csrf-fetch");
    const { setBrowserOwner } = await import("@/lib/browser-owner");
    installCsrfFetch();
    setBrowserOwner("request-A");
    const response = await browser.fetch("/api/data/applications");
    const clone = response.clone();
    const reader = clone.body!.getReader();
    setBrowserOwner("request-B");
    await expect(response.json()).rejects.toThrow("账号已变更");
    await expect(reader.read()).rejects.toThrow("账号已变更");
  });

  it("does not reuse an old pending CSRF token in the next account", async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return entries.size; },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    let finishOldToken: (response: Response) => void = () => {};
    let tokenRequests = 0;
    const network = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === "/api/auth/csrf") {
        tokenRequests++;
        if (tokenRequests === 1) return new Promise<Response>((resolve) => { finishOldToken = resolve; });
        return Response.json({ csrfToken: "B_TOKEN", expiresIn: 1800 });
      }
      return Response.json({ ok: true });
    });
    const browser = {
      fetch: network as typeof fetch,
      location: { href: "https://example.test/settings", origin: "https://example.test", pathname: "/settings" },
    };
    vi.stubGlobal("window", browser);
    const { installCsrfFetch } = await import("@/lib/security/csrf-fetch");
    const { setBrowserOwner } = await import("@/lib/browser-owner");
    installCsrfFetch();
    setBrowserOwner("request-A");
    const oldRequest = browser.fetch("/api/data/applications", { method: "POST" });
    const oldResult = expect(oldRequest).rejects.toThrow("账号已变更");
    await browser.fetch("/api/auth/login", { method: "POST" });
    setBrowserOwner("request-B");
    const nextRequest = browser.fetch("/api/data/applications", { method: "POST" });
    finishOldToken(Response.json({ csrfToken: "A_TOKEN", expiresIn: 1800 }));
    await oldResult;
    await nextRequest;
    expect(tokenRequests).toBe(2);
    const mutation = network.mock.calls.find((call) => String(call[0]) === "/api/data/applications");
    expect(new Headers((mutation?.[1] as RequestInit)?.headers).get("X-CSRF-Token")).toBe("B_TOKEN");
  });

  it("blocks a late response from the old account and requests made before account verification", async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return entries.size; },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    let complete: (response: Response) => void = () => {};
    const network = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const browser: { fetch: typeof fetch; location: { href: string; origin: string; pathname: string } } = {
      fetch: network,
      location: { href: "https://example.test/settings", origin: "https://example.test", pathname: "/settings" },
    };
    vi.stubGlobal("window", browser);
    const { installCsrfFetch } = await import("@/lib/security/csrf-fetch");
    const { setBrowserOwner } = await import("@/lib/browser-owner");
    installCsrfFetch();
    await expect(browser.fetch("/api/data/applications")).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();

    setBrowserOwner("request-A");
    const response = browser.fetch("/api/data/applications");
    setBrowserOwner("request-B");
    complete(new Response(JSON.stringify({ data: ["A_PRIVATE"] })));
    await expect(response).rejects.toThrow("账号已变更");
  });
});
