import crypto from 'crypto';
import { db, schema } from './client';
import { auth } from '@/lib/auth/config';

export interface AuditEntry {
  action: string;
  target_type: 'proposal' | 'milestone' | 'budget_period' | 'user' | 'payment';
  target_id: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
}

/** Write a single audit entry. Resolves the actor from NextAuth session at call time. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  let actorLogin: string | null = null;
  let actorRole: string | null = null;
  try {
    const session = await auth();
    if (session?.user) {
      actorLogin = session.user.githubLogin || null;
      actorRole = session.user.role || null;
    }
  } catch {
    // No session — leave actor null (e.g. cron-triggered or unauthenticated dev call)
  }
  await db.insert(schema.audit_log).values({
    id: `al-${crypto.randomBytes(6).toString('hex')}`,
    actor_login: actorLogin,
    actor_role: actorRole,
    action: entry.action,
    target_type: entry.target_type,
    target_id: entry.target_id,
    before_json: entry.before ? JSON.stringify(entry.before) : null,
    after_json: entry.after ? JSON.stringify(entry.after) : null,
    note: entry.note || null,
  });
}

/** Diff two objects, returning only the keys whose values differ. */
export function diffPatch(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { changed: Record<string, unknown>; previous: Record<string, unknown> } {
  const changed: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (after[k] !== undefined && JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changed[k] = after[k];
      previous[k] = before[k];
    }
  }
  return { changed, previous };
}
