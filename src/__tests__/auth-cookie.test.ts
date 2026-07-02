import { afterEach, describe, expect, it } from "vitest";
import { shouldUseSecureAuthCookie } from "@/lib/auth-cookie";

function requestWith(headers: Record<string, string>, protocol = "http:") {
  return {
    headers: new Headers(headers),
    nextUrl: { protocol },
  };
}

describe("auth cookie security", () => {
  const originalOverride = process.env.AUTH_COOKIE_SECURE;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = originalOverride;
    }
  });

  it("does not mark cookies Secure for LAN HTTP requests", () => {
    delete process.env.AUTH_COOKIE_SECURE;

    expect(shouldUseSecureAuthCookie(requestWith({ "x-forwarded-proto": "http" }))).toBe(false);
  });

  it("marks cookies Secure for HTTPS requests", () => {
    delete process.env.AUTH_COOKIE_SECURE;

    expect(shouldUseSecureAuthCookie(requestWith({}, "https:"))).toBe(true);
    expect(shouldUseSecureAuthCookie(requestWith({ "x-forwarded-proto": "https" }))).toBe(true);
  });

  it("supports an explicit deployment override", () => {
    process.env.AUTH_COOKIE_SECURE = "false";
    expect(shouldUseSecureAuthCookie(requestWith({ "x-forwarded-proto": "https" }))).toBe(false);

    process.env.AUTH_COOKIE_SECURE = "true";
    expect(shouldUseSecureAuthCookie(requestWith({ "x-forwarded-proto": "http" }))).toBe(true);
  });
});
