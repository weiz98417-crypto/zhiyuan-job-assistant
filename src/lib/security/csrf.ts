import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

const CSRF_ISSUER = 'zhiyuan-job-assistant';
const CSRF_AUDIENCE = 'csrf';
export const CSRF_TTL_SECONDS = 30 * 60;

export type RequestOriginResult =
  | { ok: true }
  | { ok: false; code: 'ORIGIN_REQUIRED' | 'ORIGIN_FORBIDDEN' | 'ORIGIN_MISCONFIGURED' };

export type CsrfValidationResult =
  | { ok: true }
  | { ok: false; code: 'ORIGIN_REQUIRED' | 'ORIGIN_FORBIDDEN' | 'ORIGIN_MISCONFIGURED' | 'CSRF_REQUIRED' | 'CSRF_INVALID' };

function csrfSecret(): Uint8Array {
  const configured = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  const fallback = 'dev-csrf-secret-change-in-production-min-32-chars';
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('CSRF_SECRET must contain at least 32 characters in production');
  }
  return new TextEncoder().encode(configured || fallback);
}

async function authFingerprint(authToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authToken));
  const binary = Array.from(new Uint8Array(digest), (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function configuredOrigin(request: NextRequest): string | null {
  const raw = process.env.APP_ORIGIN || (process.env.NODE_ENV !== 'production' ? request.nextUrl.origin : '');
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function validateRequestOrigin(request: NextRequest): RequestOriginResult {
  const expected = configuredOrigin(request);
  if (!expected) return { ok: false, code: 'ORIGIN_MISCONFIGURED' };
  const supplied = request.headers.get('origin');
  if (!supplied) return { ok: false, code: 'ORIGIN_REQUIRED' };
  try {
    if (new URL(supplied).origin !== expected) return { ok: false, code: 'ORIGIN_FORBIDDEN' };
  } catch {
    return { ok: false, code: 'ORIGIN_FORBIDDEN' };
  }
  return { ok: true };
}

export async function createCsrfToken(authToken: string): Promise<string> {
  return new SignJWT({ authFingerprint: await authFingerprint(authToken) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(CSRF_ISSUER)
    .setAudience(CSRF_AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${CSRF_TTL_SECONDS}s`)
    .sign(csrfSecret());
}

export async function validateCsrfMutation(
  request: NextRequest,
  authToken: string,
): Promise<CsrfValidationResult> {
  const origin = validateRequestOrigin(request);
  if (!origin.ok) return origin;

  const headerToken = request.headers.get('x-csrf-token');
  const cookieToken = request.cookies.get('csrf_token')?.value;
  if (!headerToken || !cookieToken) return { ok: false, code: 'CSRF_REQUIRED' };
  if (headerToken !== cookieToken) return { ok: false, code: 'CSRF_INVALID' };

  try {
    const { payload } = await jwtVerify(headerToken, csrfSecret(), {
      issuer: CSRF_ISSUER,
      audience: CSRF_AUDIENCE,
    });
    if (payload.authFingerprint !== await authFingerprint(authToken)) {
      return { ok: false, code: 'CSRF_INVALID' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'CSRF_INVALID' };
  }
}
