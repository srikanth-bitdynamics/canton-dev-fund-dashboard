import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { desc } from 'drizzle-orm';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
  const entries = db
    .select()
    .from(schema.audit_log)
    .orderBy(desc(schema.audit_log.at))
    .limit(limit)
    .all();
  return NextResponse.json({ entries });
}
