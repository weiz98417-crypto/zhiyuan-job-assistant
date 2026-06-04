import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDataRepositories } from '@/lib/data-repositories';

export async function GET() {
  try {
    const payload = await getCurrentUser();

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
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
