import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("anonymous password recovery browser request", () => {
  it("submits the recovery request without requiring an authenticated CSRF token", async () => {
    const network = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/auth/password/recovery-request") {
        return new Response(JSON.stringify({ code: "RECOVERY_REQUEST_ACCEPTED" }), { status: 202 });
      }
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    });
    const browser = {
      fetch: network,
      location: { href: "https://example.test/forgot-password", origin: "https://example.test", pathname: "/forgot-password" },
    };
    vi.stubGlobal("window", browser);
    const { installCsrfFetch } = await import("@/lib/security/csrf-fetch");
    installCsrfFetch();

    const response = await browser.fetch("/api/auth/password/recovery-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: "test-member" }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ code: "RECOVERY_REQUEST_ACCEPTED" });
    expect(network).toHaveBeenCalledTimes(1);
  });
});
