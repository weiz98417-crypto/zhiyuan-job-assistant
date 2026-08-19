import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { requireAuthenticated } from '@/lib/security/auth-guards';
import { createCsrfToken, CSRF_TTL_SECONDS } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticated();
    const authToken = request.cookies.get('auth_token')?.value;
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const csrfToken = await createCsrfToken(authToken);
    const response = NextResponse.json(
      { csrfToken, expiresIn: CSRF_TTL_SECONDS },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: true,
      secure: shouldUseSecureAuthCookie(request),
      sameSite: 'strict',
      path: '/',
      maxAge: CSRF_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    if (candidate.status === 401 || candidate.status === 403) {
      return NextResponse.json({ error: candidate.message, code: candidate.code }, { status: candidate.status });
    }
    console.error('[auth/csrf]', error);
    return NextResponse.json(
      { error: 'Authentication security subsystem unavailable', code: 'AUTH_SECURITY_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
