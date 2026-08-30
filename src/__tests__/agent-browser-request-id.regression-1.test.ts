import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserRequestId } from "@/lib/browser-request-id";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Agent browser request ids", () => {
  it("creates a UUID when an insecure HTTP context lacks randomUUID", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(createBrowserRequestId()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("keeps browser pages off direct randomUUID calls", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");
    const adminPage = readFileSync(path.join(process.cwd(), "src/app/admin/agent-runs/page.tsx"), "utf8");

    expect(page).toContain("createBrowserRequestId()");
    expect(page).not.toContain("crypto.randomUUID()");
    expect(adminPage).toContain("createBrowserRequestId()");
    expect(adminPage).not.toContain("crypto.randomUUID()");
  });
});
