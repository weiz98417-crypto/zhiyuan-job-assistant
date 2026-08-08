import { NextResponse } from 'next/server';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAuthenticated } from '@/lib/security/auth-guards';

export async function GET() {
  let payload;
  try {
    payload = await requireAuthenticated();
  } catch (error) {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    if (candidate.status === 401 || candidate.status === 403) {
      return NextResponse.json(
        { error: candidate.message, code: candidate.code },
        { status: candidate.status },
      );
    }
    console.error('[users/me] session validation failed', error);
    return NextResponse.json(
      { error: 'Authentication subsystem unavailable', code: 'AUTH_UNAVAILABLE' },
      { status: 503 },
    );
  }

  try {
    const user = await getDataRepositories().users.findById(payload.userId);

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      status: user.status,
      tokenVersion: user.token_version,
    });
  } catch (error) {
    console.error('[users/me] unable to read current user', error);
    return NextResponse.json(
      { error: 'Unable to read current user', code: 'USER_LOOKUP_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
