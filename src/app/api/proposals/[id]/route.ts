import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq, inArray } from 'drizzle-orm';

/**
 * Public read-only endpoint for a single proposal — full detail.
 * Returns proposal + milestones + payments + parsed metadata.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const proposal = db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).get();
  if (!proposal) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const milestones = db
    .select()
    .from(schema.milestones)
    .where(eq(schema.milestones.proposal_id, id))
    .all()
    .sort((a, b) => a.milestone_number - b.milestone_number);

  // Payments for this proposal's milestones
  const milestoneIds = milestones.map((m) => m.id);
  const payments = milestoneIds.length > 0
    ? db.select().from(schema.payments).where(inArray(schema.payments.milestone_id, milestoneIds)).all()
    : [];

  return NextResponse.json({ proposal, milestones, payments });
}
