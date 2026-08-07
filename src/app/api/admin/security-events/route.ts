import { NextRequest, NextResponse } from 'next/server';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireSuperadmin } from '@/lib/security/auth-guards';

function optionalFilter(params: URLSearchParams, key: string, maxLength = 100) {
  const value = params.get(key)?.trim();
  return value ? value.slice(0, maxLength) : undefined;
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin();
    const params = request.nextUrl.searchParams;
    const requestedLimit = Number.parseInt(params.get('limit') || '50', 10);
    const requestedOffset = Number.parseInt(params.get('offset') || '0', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;

    const result = await getDataRepositories().securityEvents.list({
      eventType: optionalFilter(params, 'eventType'),
      outcome: optionalFilter(params, 'outcome', 30),
      actorUserId: optionalFilter(params, 'actorUserId'),
      targetUserId: optionalFilter(params, 'targetUserId'),
      limit,
      offset,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const authError = error as { status?: unknown; code?: unknown; message?: unknown };
    if (authError.status === 401 || authError.status === 403) {
      return NextResponse.json({
        error: typeof authError.message === 'string' ? authError.message : 'Unauthorized',
        code: typeof authError.code === 'string' ? authError.code : 'UNAUTHORIZED',
      }, { status: authError.status });
    }
    console.error('[admin/security-events]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
