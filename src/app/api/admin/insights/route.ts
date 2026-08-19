import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/auth-guards';
import { getTeamInsightsForSelectedDatabase } from '@/lib/team-insights';

export async function GET() {
  try {
    await requireAdmin();

    const insights = await getTeamInsightsForSelectedDatabase();

    return NextResponse.json(insights);
  } catch (err) {
    if (['Not authenticated', 'Invalid or expired token', 'Token has been revoked'].includes((err as Error).message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((err as Error).message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[admin/insights]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
