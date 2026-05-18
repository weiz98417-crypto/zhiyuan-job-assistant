import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server-db';
import { getCurrentUser } from '@/lib/auth';
import { getTeamInsights } from '@/lib/team-insights';

export async function GET() {
  try {
    const payload = await getCurrentUser();
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const insights = getTeamInsights(db);

    return NextResponse.json(insights);
  } catch (err) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/insights]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
