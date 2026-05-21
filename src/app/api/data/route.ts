import { NextResponse } from 'next/server';
import { queryAppData, getLatestSyncLog } from '@/lib/db/queries';

export async function GET() {
  try {
    const data = await queryAppData();
    const lastSync = await getLatestSyncLog();
    return NextResponse.json({ ...data, _lastSync: lastSync });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
