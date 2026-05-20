// Pure role types + comparison — Edge-compatible.
// No DB/Node imports here so the middleware can use it safely.

export type Role = 'viewer' | 'committee_member' | 'admin';

export function hasRole(role: Role | undefined, required: Role): boolean {
  if (!role) return false;
  const order: Record<Role, number> = { viewer: 0, committee_member: 1, admin: 2 };
  return order[role] >= order[required];
}
