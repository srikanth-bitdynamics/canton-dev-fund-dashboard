'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  github_id: number;
  github_login: string;
  name: string | null;
  role: 'viewer' | 'committee_member' | 'admin';
}

export default function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [newLogin, setNewLogin] = useState('');
  const [newRole, setNewRole] = useState<User['role']>('committee_member');

  const load = async () => {
    const res = await fetch('/api/admin/users');
    const j = await res.json();
    setUsers(j.users || []);
  };
  useEffect(() => { void load(); }, []);

  const setRole = async (github_login: string, role: User['role']) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_login, role }),
    });
    await load();
  };

  const addOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogin) return;
    await setRole(newLogin, newRole);
    setNewLogin('');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">User roles</h1>
          <p className="page-sub">
            Roles default to GitHub org membership (canton-foundation admin → admin, member → committee_member).
            Manual overrides here take precedence.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3 className="card-title">Override a user&rsquo;s role</h3>
          <p className="card-sub">Enter their GitHub login — the row will be created if they haven&rsquo;t signed in yet.</p>
        </div>
        <form onSubmit={addOverride} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="github_login"
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink-1)', fontFamily: 'inherit', fontSize: 13 }}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as User['role'])}
            style={{ padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink-1)', fontFamily: 'inherit', fontSize: 13 }}
          >
            <option value="viewer">viewer</option>
            <option value="committee_member">committee_member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className="btn btn-primary">Save</button>
        </form>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>GitHub login</th><th>GitHub ID</th><th>Name</th><th>Role</th></tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={4} className="empty">No users yet. Users are created on their first sign-in or via the form above.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="row">
                <td><strong>{u.github_login}</strong></td>
                <td className="mono">{u.github_id || '—'}</td>
                <td>{u.name || '—'}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u.github_login, e.target.value as User['role'])}
                    style={{ padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink-1)', fontFamily: 'inherit', fontSize: 12 }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="committee_member">committee_member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
