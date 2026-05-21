import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { desc } from 'drizzle-orm';

export async function GET() {
  const rows = await db
    .select()
    .from(schema.sync_log)
    .orderBy(desc(schema.sync_log.started_at))
    .limit(20);
  return NextResponse.json({ logs: rows });
}
