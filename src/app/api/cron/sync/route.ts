import { NextResponse } from 'next/server';
import { syncProposals } from '@/lib/db/sync';

export const maxDuration = 60;

/**
 * Vercel cron handler. Runs hourly.
 * Configured in vercel.json — see schedule "0 * * * *".
 *
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET> on cron invocations.
 * Verify it to prevent unauthorized triggering.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;

  if (expected && auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncProposals();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
