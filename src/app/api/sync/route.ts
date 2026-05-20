import { NextResponse } from 'next/server';
import { syncProposals } from '@/lib/db/sync';

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncProposals();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Also allow GET for easy browser-triggered syncs in dev
export async function GET() {
  return POST();
}
