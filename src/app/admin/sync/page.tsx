'use client';

import { useEffect, useState } from 'react';
import { fmtDate, relTime } from '@/lib/utils';

interface SyncLog {
  id: string;
  sync_type: string;
  source: string | null;
  status: string;
  items_processed: number | null;
  errors: string | null;
  started_at: string;
  completed_at: string | null;
}

export default function SyncAdmin() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const loadLogs = async () => {
    const res = await fetch('/api/admin/sync-log');
    const j = await res.json();
    setLogs(j.logs || []);
  };
  useEffect(() => { void loadLogs(); }, []);

  const runSync = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const j = await res.json();
      setLastResult(
        `✓ Synced ${j.proposals_synced || 0} proposals + ${j.pipeline_synced || 0} pipeline · ${j.milestones_synced || 0} milestones · ${j.duration_ms || 0}ms`,
      );
    } catch (e) {
      setLastResult(`✗ ${(e as Error).message}`);
    }
    setRunning(false);
    await loadLogs();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sync management</h1>
          <p className="page-sub">Pull latest proposal data from <code>canton-foundation/canton-dev-fund</code>. Hourly automatic sync runs via Vercel cron (Phase 7).</p>
        </div>
        <button className="btn btn-primary" onClick={runSync} disabled={running}>
          {running ? 'Syncing…' : '↻ Run sync now'}
        </button>
      </div>

      {lastResult && (
        <div className="card" style={{ marginBottom: 14, fontSize: 13, color: 'var(--ink-1)' }}>{lastResult}</div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>When</th><th>Type</th><th>Source</th><th>Status</th><th style={{ textAlign: 'right' }}>Items</th><th>Errors</th></tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={6} className="empty">No sync history yet.</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="row">
                <td>
                  <div style={{ fontSize: 12 }}>{fmtDate(new Date(l.started_at), { long: true })}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{relTime(new Date(l.started_at))}</div>
                </td>
                <td>{l.sync_type}</td>
                <td className="mono" style={{ fontSize: 11 }}>{l.source}</td>
                <td>
                  <span className={`pill pill-${l.status === 'completed' ? 'good' : l.status === 'failed' ? 'bad' : 'soft'}`}>
                    {l.status}
                  </span>
                </td>
                <td className="num">{l.items_processed ?? 0}</td>
                <td style={{ fontSize: 11, color: 'var(--ink-3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.errors || ''}>
                  {l.errors ? `${(JSON.parse(l.errors) as unknown[]).length} error(s)` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
