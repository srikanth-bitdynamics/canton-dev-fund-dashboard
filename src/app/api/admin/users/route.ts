import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { writeAudit } from '@/lib/db/audit';

export async function GET() {
  const rows = await db.select().from(schema.users);
  return NextResponse.json({ users: rows });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { github_login, role } = body;
    if (!github_login || !['viewer', 'committee_member', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'invalid input' }, { status: 400 });
    }
    const existing = (await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.github_login, github_login))
      .limit(1))[0];
    if (existing) {
      const before = { role: existing.role };
      await db.update(schema.users)
        .set({ role, updated_at: new Date().toISOString() })
        .where(eq(schema.users.github_login, github_login));
      await writeAudit({
        action: 'change_role',
        target_type: 'user',
        target_id: github_login,
        before,
        after: { role },
        note: `${github_login}: ${before.role} → ${role}`,
      });
    } else {
      await db.insert(schema.users).values({
        id: `u-${crypto.randomBytes(6).toString('hex')}`,
        github_id: 0,
        github_login,
        role,
      });
      await writeAudit({
        action: 'grant_role',
        target_type: 'user',
        target_id: github_login,
        after: { role },
        note: `Granted ${role} to ${github_login}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
