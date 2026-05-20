'use client';

import { useEffect, useState } from 'react';
import { fmtDate, relTime } from '@/lib/utils';

interface AuditEntry {
  id: string;
  actor_login: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string;
  before_json: string | null;
  after_json: string | null;
  note: string | null;
  at: string;
}

export default function AuditAdmin() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/admin/audit-log?limit=200').then((r) => r.json()).then((j) => setEntries(j.entries || []));
  }, []);

  const actors = Array.from(new Set(entries.map((e) => e.actor_login).filter((a): a is string => !!a)));
  const filtered = actorFilter === 'all' ? entries : entries.filter((e) => e.actor_login === actorFilter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="page-sub">
            Every admin change is recorded — who, what, when. Showing last 200 entries.
          </p>
        </div>
      </div>

      <div className="filterbar">
        <button className={`chip ${actorFilter === 'all' ? 'on' : ''}`} onClick={() => setActorFilter('all')}>
          All <span style={{ color: 'var(--ink-4)' }}>{entries.length}</span>
        </button>
        {actors.map((a) => (
          <button key={a} className={`chip ${actorFilter === a ? 'on' : ''}`} onClick={() => setActorFilter(a)}>
            {a} <span style={{ color: 'var(--ink-4)' }}>{entries.filter((e) => e.actor_login === a).length}</span>
          </button>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 140 }}>When</th>
              <th style={{ width: 130 }}>Actor</th>
              <th style={{ width: 130 }}>Action</th>
              <th>Target</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="empty">No audit entries yet.</td></tr>
            )}
            {filtered.map((e) => {
              const isExpanded = expanded === e.id;
              return (
                <>
                  <tr key={e.id} className="row" onClick={() => setExpanded(isExpanded ? null : e.id)}>
                    <td>
                      <div style={{ fontSize: 11.5 }}>{relTime(new Date(e.at))}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{fmtDate(new Date(e.at), { long: true })}</div>
                    </td>
                    <td>
                      {e.actor_login ? (
                        <div>
                          <div style={{ fontSize: 12 }}>{e.actor_login}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{e.actor_role || '—'}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--ink-4)' }}>system</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill pill-${e.action.startsWith('release') ? 'good' : e.action.startsWith('change') ? 'warn' : 'soft'}`}>
                        {e.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{e.target_type}</div>
                      <div className="mono" style={{ fontSize: 11.5 }}>{e.target_id}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12 }}>{e.note || '—'}</div>
                      {(e.before_json || e.after_json) && (
                        <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>
                          click to expand diff
                        </div>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (e.before_json || e.after_json) && (
                    <tr key={e.id + '-detail'}>
                      <td colSpan={5} style={{ background: 'var(--bg)', padding: '12px 18px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 11.5 }}>
                          <div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Before</div>
                            <pre className="code" style={{ fontSize: 11 }}>{e.before_json ? JSON.stringify(JSON.parse(e.before_json), null, 2) : '—'}</pre>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>After</div>
                            <pre className="code" style={{ fontSize: 11 }}>{e.after_json ? JSON.stringify(JSON.parse(e.after_json), null, 2) : '—'}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
