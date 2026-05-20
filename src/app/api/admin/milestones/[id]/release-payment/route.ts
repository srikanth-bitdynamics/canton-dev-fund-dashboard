import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { writeAudit } from '@/lib/db/audit';

interface ReleasePayload {
  amount_cc?: number;        // optional override; defaults to milestone funding_cc
  transaction_hash: string;  // on-chain tx hash
  released_date?: string;    // ISO date; defaults to today
  notes?: string;
  evidence_url?: string;     // link to GitHub evidence (issue, comment, repo)
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: milestone_id } = await ctx.params;
    const body: ReleasePayload = await req.json();

    if (!body.transaction_hash) {
      return NextResponse.json({ error: 'transaction_hash required' }, { status: 400 });
    }

    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, milestone_id))
      .get();
    if (!milestone) {
      return NextResponse.json({ error: 'milestone not found' }, { status: 404 });
    }

    const amount_cc = body.amount_cc !== undefined ? Number(body.amount_cc) : milestone.funding_cc;
    const released_date = body.released_date || new Date().toISOString().split('T')[0];

    // Create the payment row
    const payment_id = `pay-${crypto.randomBytes(6).toString('hex')}`;
    db.insert(schema.payments).values({
      id: payment_id,
      milestone_id,
      amount_cc,
      released_date,
      status: 'released',
      transaction_hash: body.transaction_hash,
      notes: body.notes ?? null,
      evidence_url: body.evidence_url ?? null,
    }).run();

    // Mark the milestone delivered + payment released
    db.update(schema.milestones)
      .set({
        status: 'delivered',
        payment_released_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where(eq(schema.milestones.id, milestone_id))
      .run();

    await writeAudit({
      action: 'release_payment',
      target_type: 'payment',
      target_id: payment_id,
      after: {
        milestone_id,
        amount_cc,
        transaction_hash: body.transaction_hash,
        released_date,
      },
      note: `Released ${amount_cc.toLocaleString()} CC for ${milestone_id} · tx ${body.transaction_hash.slice(0, 12)}…`,
    });

    return NextResponse.json({ ok: true, payment_id, amount_cc });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
