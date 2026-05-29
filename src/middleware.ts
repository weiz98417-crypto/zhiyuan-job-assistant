import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars!!'
);

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
];

// Rate limiting: in-memory map (Edge Runtime — per-isolate, good enough for brute-force protection)
interface RateEntry { count: number; resetAt: number; }
const rateMap = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX = 5;            // max 5 attempts per window

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit on login endpoint
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const ip = getClientIp(request);
    const now = Date.now();
    const entry = rateMap.get(ip);

    if (entry && now < entry.resetAt && entry.count >= RATE_MAX) {
      return NextResponse.json(
        { error: '请求过于频繁，请1分钟后再试' },
        { status: 429 }
      );
    }

    if (!entry || now >= entry.resetAt) {
      rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    } else {
      entry.count++;
    }
  }

  // Public paths — allow unauthenticated access
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Static assets — bypass
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/_next') ||
    pathname.match(/\.(ico|png|svg|jpg|jpeg|woff2?|ttf|css)$/)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Edge: verify signature + expiry only (no DB lookup)
  let role: string = 'member';
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    role = (payload as Record<string, unknown>).role as string || 'member';
  } catch {
    // Token expired or invalid
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Token expired' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('auth_token');
    return response;
  }

  // Admin-only route check
  if (pathname.startsWith('/admin') && role !== 'admin') {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
