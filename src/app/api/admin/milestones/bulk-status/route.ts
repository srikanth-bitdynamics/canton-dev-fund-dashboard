import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { inArray } from 'drizzle-orm';
import { writeAudit } from '@/lib/db/audit';

interface BulkStatusPayload {
  milestone_ids: string[];
  status: 'planned' | 'in-progress' | 'in-review' | 'delivered' | 'at-risk';
}

export async function POST(req: Request) {
  try {
    const body: BulkStatusPayload = await req.json();
    const { milestone_ids, status } = body;
    if (!Array.isArray(milestone_ids) || milestone_ids.length === 0) {
      return NextResponse.json({ error: 'milestone_ids required' }, { status: 400 });
    }
    if (!['planned', 'in-progress', 'in-review', 'delivered', 'at-risk'].includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    // Snapshot current statuses for audit
    const before = await db
      .select({ id: schema.milestones.id, status: schema.milestones.status })
      .from(schema.milestones)
      .where(inArray(schema.milestones.id, milestone_ids));

    await db.update(schema.milestones)
      .set({ status, updated_at: new Date().toISOString() })
      .where(inArray(schema.milestones.id, milestone_ids));

    await writeAudit({
      action: 'bulk_milestone_status',
      target_type: 'milestone',
      target_id: milestone_ids.join(','),
      before: Object.fromEntries(before.map((b) => [b.id, b.status])),
      after: { status, count: milestone_ids.length },
      note: `Set ${milestone_ids.length} milestone(s) to ${status}`,
    });

    return NextResponse.json({ ok: true, updated: milestone_ids.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
