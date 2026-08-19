import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { assertSelectedDatabaseReady, getDataRepositories } from './data-repositories';

// ── JWT Secret (lazy — defers validation to runtime, not build-time) ──
let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (_jwtSecret) return _jwtSecret;
  const raw = process.env.JWT_SECRET;
  if (!raw || raw === 'dev-secret-change-in-production-min-32-chars!!') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET 未设置或使用默认值，生产环境禁止启动。请设置环境变量 JWT_SECRET（≥32字符随机字符串）。'
      );
    }
    console.warn('[auth] 使用默认 JWT_SECRET——仅开发环境安全');
  }
  _jwtSecret = new TextEncoder().encode(
    raw || 'dev-secret-change-in-production-min-32-chars!!'
  );
  return _jwtSecret;
}

const JWT_EXPIRES_IN = '24h';

// ── Types ──
export interface JWTPayload {
  userId: string;
  username: string;
  role: 'admin' | 'member';
  tokenVersion: number;
}

// ── JWT ──
export async function signToken(user: {
  id: string;
  username: string;
  role: string;
  tokenVersion: number;
}): Promise<string> {
  return new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role as 'admin' | 'member',
    tokenVersion: user.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(JWT_EXPIRES_IN)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// ── Password ──
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Current User ──
export async function getCurrentUser(): Promise<JWTPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) throw new Error('Not authenticated');
  const payload = await verifyToken(token);
  if (!payload) throw new Error('Invalid or expired token');
  await assertSelectedDatabaseReady();
  return payload;
}

// ── Token Version Check ──
/** Verify token_version against DB. Call before write operations. */
export async function verifyTokenVersion(payload: JWTPayload): Promise<void> {
  const valid = await getDataRepositories().users.verifyTokenVersion(payload.userId, payload.tokenVersion);
  if (!valid) {
    throw new Error('Token has been revoked');
  }
}
