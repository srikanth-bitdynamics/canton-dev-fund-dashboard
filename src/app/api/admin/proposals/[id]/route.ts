import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { writeAudit, diffPatch } from '@/lib/db/audit';

interface MilestoneInput {
  id?: string;
  milestone_number: number;
  title: string;
  funding_cc: number;
  estimated_delivery?: string | null;
  status?: string;
}

interface UpdatePayload {
  title?: string;
  author?: string;
  champion?: string | null;
  status?: string;
  category?: string | null;
  total_funding_cc?: number;
  quarter?: string | null;
  website?: string | null;
  twitter?: string | null;
  milestones?: MilestoneInput[];
  milestones_locked?: boolean;
}

// Fields that, when admin-edited, get added to the overrides list
const OVERRIDABLE_FIELDS = [
  'title', 'author', 'champion', 'status', 'category',
  'total_funding_cc', 'quarter', 'website', 'twitter',
];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const proposal = (await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1))[0];
  if (!proposal) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const milestones = (await db
    .select()
    .from(schema.milestones)
    .where(eq(schema.milestones.proposal_id, id)))
    .sort((a, b) => a.milestone_number - b.milestone_number);
  return NextResponse.json({ proposal, milestones });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body: UpdatePayload = await req.json();

  const existing = (await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1))[0];
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Build the patch — only include fields actually sent
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const beforeSnap: Record<string, unknown> = {};
  for (const f of OVERRIDABLE_FIELDS) {
    if (body[f as keyof UpdatePayload] !== undefined) {
      patch[f] = body[f as keyof UpdatePayload];
      beforeSnap[f] = (existing as unknown as Record<string, unknown>)[f];
    }
  }
  if (body.total_funding_cc !== undefined) patch.total_funding_cc = Number(body.total_funding_cc);

  // Compute which fields actually changed (don't add unchanged ones to overrides)
  const { changed, previous } = diffPatch(beforeSnap, patch);
  const changedFields = Object.keys(changed).filter((k) => OVERRIDABLE_FIELDS.includes(k));

  if (changedFields.length > 0) {
    // Merge into existing overrides list
    const currentOverrides: string[] = existing.overrides ? JSON.parse(existing.overrides) : [];
    const newOverrides = Array.from(new Set([...currentOverrides, ...changedFields]));
    patch.overrides = JSON.stringify(newOverrides);
  }

  // Handle milestones_locked flag
  if (body.milestones_locked !== undefined) {
    patch.milestones_locked = body.milestones_locked;
  }

  if (Object.keys(patch).length > 1) {
    await db.update(schema.proposals).set(patch).where(eq(schema.proposals.id, id));
  }

  // Replace milestones if provided; also lock them so sync won't clobber
  let milestonesChanged = false;
  if (body.milestones) {
    await db.delete(schema.milestones).where(eq(schema.milestones.proposal_id, id));
    for (const m of body.milestones) {
      const mid = m.id?.startsWith('new-')
        ? `${id}-M${m.milestone_number}-${crypto.randomBytes(3).toString('hex')}`
        : m.id || `${id}-M${m.milestone_number}-${crypto.randomBytes(3).toString('hex')}`;
      await db.insert(schema.milestones).values({
        id: mid,
        proposal_id: id,
        milestone_number: m.milestone_number,
        title: m.title,
        funding_cc: Number(m.funding_cc) || 0,
        estimated_delivery: m.estimated_delivery ?? null,
        status: m.status || 'planned',
      });
    }
    // Auto-lock milestones after any admin edit
    await db.update(schema.proposals)
      .set({ milestones_locked: true, updated_at: new Date().toISOString() })
      .where(eq(schema.proposals.id, id));
    milestonesChanged = true;
  }

  // Write audit log if anything actually changed
  if (changedFields.length > 0 || milestonesChanged) {
    await writeAudit({
      action: 'update_proposal',
      target_type: 'proposal',
      target_id: id,
      before: previous,
      after: changed,
      note: milestonesChanged ? `Updated ${changedFields.length} field(s) + milestones (locked)` : `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
    });
  }

  return NextResponse.json({
    ok: true,
    overrides_added: changedFields,
    milestones_locked: milestonesChanged || !!existing.milestones_locked,
  });
}
