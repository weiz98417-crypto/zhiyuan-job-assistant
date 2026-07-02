type AuthCookieRequest = {
  headers: Pick<Headers, "get">;
  nextUrl?: { protocol?: string };
  url?: string;
};

function parseBooleanOverride(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
}

export function shouldUseSecureAuthCookie(request: AuthCookieRequest): boolean {
  const override = parseBooleanOverride(process.env.AUTH_COOKIE_SECURE);
  if (override !== null) return override;

  const forwardedProto = request.headers.get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  if (request.nextUrl?.protocol) return request.nextUrl.protocol === "https:";

  if (request.url) {
    try {
      return new URL(request.url).protocol === "https:";
    } catch {
      return false;
    }
  }

  return false;
}
