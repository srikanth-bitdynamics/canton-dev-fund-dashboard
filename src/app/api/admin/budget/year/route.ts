import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { writeAudit } from '@/lib/db/audit';

interface YearPayload {
  year: number;
  total_annual_cc: number;
  q1_cc?: number;
  q2_cc?: number;
  q3_cc?: number;
  q4_cc?: number;
  // If splits aren't provided, derive from total_annual
  split_mode?: 'even' | 'frontloaded' | 'custom';
}

/**
 * Bulk-create or update all four quarterly periods for a year.
 * Existing periods with the same period_name are updated; new ones are inserted.
 */
export async function POST(req: Request) {
  try {
    const body: YearPayload = await req.json();
    const { year, total_annual_cc, split_mode = 'custom' } = body;

    if (!year || !total_annual_cc) {
      return NextResponse.json({ error: 'year and total_annual_cc required' }, { status: 400 });
    }

    // Compute quarter splits
    let q1 = body.q1_cc;
    let q2 = body.q2_cc;
    let q3 = body.q3_cc;
    let q4 = body.q4_cc;

    if (split_mode === 'even' || q1 == null) {
      const each = Math.round(total_annual_cc / 4);
      q1 = q1 ?? each;
      q2 = q2 ?? each;
      q3 = q3 ?? each;
      q4 = q4 ?? (total_annual_cc - q1 - q2 - q3); // absorb rounding
    } else if (split_mode === 'frontloaded') {
      // Canton-style: 40% Q1, 20% each Q2/Q3/Q4
      q1 = q1 ?? Math.round(total_annual_cc * 0.4);
      q2 = q2 ?? Math.round(total_annual_cc * 0.2);
      q3 = q3 ?? Math.round(total_annual_cc * 0.2);
      q4 = q4 ?? total_annual_cc - q1 - q2 - q3;
    }

    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const currentYear = now.getFullYear();

    const quarters = [
      { num: 1, cc: q1!, start: `${year}-01-01`, end: `${year}-03-31` },
      { num: 2, cc: q2!, start: `${year}-04-01`, end: `${year}-06-30` },
      { num: 3, cc: q3!, start: `${year}-07-01`, end: `${year}-09-30` },
      { num: 4, cc: q4!, start: `${year}-10-01`, end: `${year}-12-31` },
    ];

    const updated: string[] = [];
    const created: string[] = [];

    for (const q of quarters) {
      const period_name = `Q${q.num} ${year}`;
      const isCurrent = year === currentYear && q.num === currentQuarter;
      const existing = (await db
        .select()
        .from(schema.budget_periods)
        .where(eq(schema.budget_periods.period_name, period_name))
        .limit(1))[0];

      if (existing) {
        await db.update(schema.budget_periods)
          .set({
            start_date: q.start,
            end_date: q.end,
            total_budget_cc: Number(q.cc),
            is_current: isCurrent,
            updated_at: new Date().toISOString(),
          })
          .where(eq(schema.budget_periods.id, existing.id));
        updated.push(period_name);
      } else {
        await db.insert(schema.budget_periods).values({
          id: `bp-${crypto.randomBytes(6).toString('hex')}`,
          period_name,
          start_date: q.start,
          end_date: q.end,
          total_budget_cc: Number(q.cc),
          is_current: isCurrent,
        });
        created.push(period_name);
      }
    }

    await writeAudit({
      action: 'set_year_budget',
      target_type: 'budget_period',
      target_id: String(year),
      after: { year, total_annual_cc, q1, q2, q3, q4 },
      note: `Set ${year} budget: ${total_annual_cc.toLocaleString()} CC total (Q1: ${q1!.toLocaleString()}, Q2: ${q2!.toLocaleString()}, Q3: ${q3!.toLocaleString()}, Q4: ${q4!.toLocaleString()})`,
    });

    return NextResponse.json({
      ok: true,
      year,
      total_annual_cc,
      split: { q1, q2, q3, q4 },
      updated,
      created,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
