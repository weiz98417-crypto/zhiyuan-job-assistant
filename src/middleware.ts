import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { validateCsrfMutation, validateRequestOrigin } from '@/lib/security/csrf';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars!!'
);

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password/recovery-request',
];

const FORCED_PASSWORD_CHANGE_PATHS = [
  '/change-password',
  '/api/auth/password/change',
  '/api/auth/logout',
  '/api/auth/csrf',
];

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ORIGIN_ONLY_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password/recovery-request',
]);

function csrfError(code: string, status = 403) {
  const error = code.startsWith('ORIGIN') ? 'Request origin is not allowed' : 'CSRF validation failed';
  return NextResponse.json({ error, code }, { status });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/_next') ||
    pathname.match(/\.(ico|png|svg|jpg|jpeg|woff2?|ttf|css)$/)
  ) {
    return NextResponse.next();
  }

  const isMutation = MUTATION_METHODS.has(request.method.toUpperCase());
  if (isMutation && ORIGIN_ONLY_AUTH_PATHS.has(pathname)) {
    const origin = validateRequestOrigin(request);
    if (!origin.ok) return csrfError(origin.code, origin.code === 'ORIGIN_MISCONFIGURED' ? 503 : 403);
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let role = 'member';
  let mustChangePassword = false;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    role = typeof payload.role === 'string' ? payload.role : 'member';
    mustChangePassword = payload.mustChangePassword === true;
  } catch {
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Token expired' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('auth_token');
    return response;
  }

  if (
    mustChangePassword &&
    !FORCED_PASSWORD_CHANGE_PATHS.some((allowed) => pathname.startsWith(allowed))
  ) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Password replacement required', code: 'PASSWORD_CHANGE_REQUIRED' },
        { status: 428 },
      );
    }
    return NextResponse.redirect(new URL('/change-password', request.url));
  }

  if (isMutation && pathname.startsWith('/api/')) {
    try {
      const csrf = await validateCsrfMutation(request, token);
      if (!csrf.ok) return csrfError(csrf.code, csrf.code === 'ORIGIN_MISCONFIGURED' ? 503 : 403);
    } catch (error) {
      console.error('[middleware/csrf]', error);
      return NextResponse.json(
        { error: 'Authentication security subsystem unavailable', code: 'AUTH_SECURITY_UNAVAILABLE' },
        { status: 503 },
      );
    }
  }

  if (pathname.startsWith('/admin') && role !== 'admin' && role !== 'superadmin') {
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
