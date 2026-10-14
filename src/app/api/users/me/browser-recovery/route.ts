import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { AuthGuardError, requireAuthenticated } from "@/lib/security/auth-guards";
import { getDataRepositories } from "@/lib/data-repositories";
import { browserCacheContentHash } from "@/lib/browser-cache-proof";

function signingKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("Recovery signing unavailable");
  return new TextEncoder().encode(secret);
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticated();
    const body = await request.json();
    if (body?.operation === "restore") {
      const key = signingKey();
      const conflict = () => NextResponse.json({ success: false, error: "恢复凭据已失效或归属不匹配，请重新核验" }, { status: 409 });
      if (typeof body.proof !== "string" || body.proof.length > 4096) return conflict();
      let claims;
      try {
        claims = (await jwtVerify(body.proof, key, { issuer: "zhiyuan-browser-recovery", audience: user.userId, algorithms: ["HS256"] })).payload;
      } catch { return conflict(); }
      if (claims.purpose !== "browser-cache-recovery" || claims.ownerId !== user.userId) return conflict();
      const current = await getDataRepositories().cv.get(user.userId);
      if (!current?.data_json) return conflict();
      const value = JSON.parse(current.data_json);
      const contentHash = await browserCacheContentHash(value);
      const syncId = "cv:" + user.userId + ":" + value.activeVersion;
      if (claims.contentHash !== contentHash || claims.syncId !== syncId) return conflict();
      return NextResponse.json({ success: true, data: { status: "verified", ownerId: user.userId, syncId, contentHash, value } });
    }
    if (body?.operation !== "preview" || typeof body.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(body.contentHash)) {
      return NextResponse.json({ success: false, error: "无效的恢复核验请求" }, { status: 400 });
    }
    const current = await getDataRepositories().cv.get(user.userId);
    if (!current?.data_json) return NextResponse.json({ success: true, data: { status: "needs_review" } });
    const data = JSON.parse(current.data_json);
    const contentHash = await browserCacheContentHash(data);
    if (body.contentHash !== contentHash || typeof data.activeVersion !== "string") {
      return NextResponse.json({ success: true, data: { status: "needs_review" } });
    }
    const syncId = "cv:" + user.userId + ":" + data.activeVersion;
    const proof = await new SignJWT({ ownerId: user.userId, syncId, contentHash, purpose: "browser-cache-recovery" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("zhiyuan-browser-recovery")
      .setAudience(user.userId)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(signingKey());
    return NextResponse.json({ success: true, data: { status: "verified", ownerId: user.userId, syncId, contentHash, proof } });
  } catch (failure) {
    const authStatus = failure instanceof AuthGuardError ? failure.status : null;
    return NextResponse.json({ success: false, error: authStatus ? "请先登录" : "旧缓存核验暂不可用，请重试" }, { status: authStatus ?? 503 });
  }
}
