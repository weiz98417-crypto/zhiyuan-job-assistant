import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTeamInsightsForSelectedDatabase } from '@/lib/team-insights';

export async function GET() {
  try {
    const payload = await getCurrentUser();
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const insights = await getTeamInsightsForSelectedDatabase();

    return NextResponse.json(insights);
  } catch (err) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/insights]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
