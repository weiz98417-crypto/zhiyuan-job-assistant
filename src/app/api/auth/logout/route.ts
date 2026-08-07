import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAuthenticated } from '@/lib/security/auth-guards';
import { getTrustedSourceIp } from '@/lib/security/request-identity';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticated();
    await getDataRepositories().securityEvents.append({
      id: crypto.randomUUID(),
      eventType: 'logout',
      actorUserId: actor.userId,
      targetUserId: actor.userId,
      actorRole: actor.role,
      outcome: 'success',
      requestId: crypto.randomUUID(),
      sourceIp: getTrustedSourceIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {},
    });
  } catch {
    // Logout remains available even if the append-only audit store is degraded.
    console.error('[auth/logout] unable to append logout audit event');
  }

  const response = NextResponse.json({ message: '已退出' });
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: shouldUseSecureAuthCookie(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set('csrf_token', '', {
    httpOnly: true,
    secure: shouldUseSecureAuthCookie(request),
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
