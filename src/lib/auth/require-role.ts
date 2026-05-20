import { auth } from './config';
import { hasRole, type Role } from './role-types';

const AUTH_CONFIGURED = !!process.env.AUTH_GITHUB_ID;

/**
 * Returns { ok: true } if caller has the required role, else { ok: false, status, message }.
 * In dev (no AUTH_GITHUB_ID set), always returns ok: true.
 *
 * Use at the top of admin route handlers:
 *
 *   const gate = await requireRole('committee_member');
 *   if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
 */
export async function requireRole(required: Role): Promise<
  | { ok: true; role: Role | undefined; login: string | undefined }
  | { ok: false; status: number; message: string }
> {
  if (!AUTH_CONFIGURED) {
    // Dev escape — let it through (the middleware also lets you through)
    return { ok: true, role: 'admin', login: 'dev' };
  }
  const session = await auth();
  if (!session?.user) {
    return { ok: false, status: 401, message: 'not signed in' };
  }
  if (!hasRole(session.user.role, required)) {
    return { ok: false, status: 403, message: `requires ${required} role` };
  }
  return { ok: true, role: session.user.role, login: session.user.githubLogin };
}
