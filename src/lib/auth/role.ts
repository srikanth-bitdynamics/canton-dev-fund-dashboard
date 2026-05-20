// Role derivation — only called during sign-in (Node runtime via NextAuth jwt callback).
// Imports DB + makes external API calls.
// Edge-compatible code lives in role-types.ts.

export { hasRole, type Role } from './role-types';
import type { Role } from './role-types';

const COMMITTEE_ORG = 'canton-foundation';

// Bootstrap admin allowlist — these users are always admin, regardless of org membership.
// They can promote others via /admin/users.
const ADMIN_ALLOWLIST = new Set<string>([
  'hythloda',
  'srikanth-bitdynamics',
]);

interface GithubMembershipResponse {
  role?: string;
  state?: string;
}

export async function deriveRole(githubLogin: string, accessToken: string): Promise<Role> {
  // Hardcoded admin allowlist — bypasses org check
  if (ADMIN_ALLOWLIST.has(githubLogin.toLowerCase())) return 'admin';

  // DB override — if /admin/users assigned a custom role, honor it
  try {
    const { db, schema } = await import('@/lib/db/client');
    const { eq } = await import('drizzle-orm');
    const dbUser = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.github_login, githubLogin))
      .get();
    if (dbUser?.role && ['viewer', 'committee_member', 'admin'].includes(dbUser.role)) {
      return dbUser.role as Role;
    }
  } catch {
    // DB unavailable — fall through to GitHub check
  }

  // GitHub org membership
  try {
    const res = await fetch(
      `https://api.github.com/orgs/${COMMITTEE_ORG}/memberships/${githubLogin}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) return 'viewer';
    const data: GithubMembershipResponse = await res.json();
    if (data.state !== 'active') return 'viewer';
    if (data.role === 'admin') return 'admin';
    if (data.role === 'member') return 'committee_member';
    return 'viewer';
  } catch (e) {
    console.error('Role check failed:', e);
    return 'viewer';
  }
}
