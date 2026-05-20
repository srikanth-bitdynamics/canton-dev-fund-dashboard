import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { writeAudit } from '@/lib/db/audit';

export async function GET() {
  const rows = db.select().from(schema.budget_periods).all();
  return NextResponse.json({ periods: rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, period_name, start_date, end_date, total_budget_cc, notes, is_current } = body;
    const recordId = id || `bp-${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const existing = id
      ? db.select().from(schema.budget_periods).where(eq(schema.budget_periods.id, id)).get()
      : null;
    if (existing) {
      const before = { period_name: existing.period_name, total_budget_cc: existing.total_budget_cc };
      db.update(schema.budget_periods)
        .set({
          period_name,
          start_date,
          end_date,
          total_budget_cc: Number(total_budget_cc),
          notes,
          is_current: !!is_current,
          updated_at: now,
        })
        .where(eq(schema.budget_periods.id, id))
        .run();
      await writeAudit({
        action: 'update_budget',
        target_type: 'budget_period',
        target_id: id,
        before,
        after: { period_name, total_budget_cc: Number(total_budget_cc) },
        note: `Updated ${period_name}`,
      });
    } else {
      db.insert(schema.budget_periods).values({
        id: recordId,
        period_name,
        start_date,
        end_date,
        total_budget_cc: Number(total_budget_cc),
        notes,
        is_current: !!is_current,
      }).run();
      await writeAudit({
        action: 'create_budget',
        target_type: 'budget_period',
        target_id: recordId,
        after: { period_name, total_budget_cc: Number(total_budget_cc) },
        note: `Created ${period_name} with ${Number(total_budget_cc).toLocaleString()} CC`,
      });
    }
    return NextResponse.json({ id: recordId, ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    db.delete(schema.budget_periods).where(eq(schema.budget_periods.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
