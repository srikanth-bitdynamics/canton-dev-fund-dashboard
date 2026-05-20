'use client';

import { useEffect, useState, useMemo } from 'react';
import { fmtCC, fmtDate } from '@/lib/utils';

interface BudgetPeriod {
  id: string;
  period_name: string; // "Q1 2026"
  start_date: string;
  end_date: string;
  total_budget_cc: number;
  notes: string | null;
  is_current: boolean;
}

interface YearGroup {
  year: number;
  q1?: BudgetPeriod;
  q2?: BudgetPeriod;
  q3?: BudgetPeriod;
  q4?: BudgetPeriod;
  total: number;
}

export default function BudgetAdmin() {
  const [periods, setPeriods] = useState<BudgetPeriod[]>([]);
  const [editing, setEditing] = useState<Partial<BudgetPeriod> | null>(null);
  const [yearWizard, setYearWizard] = useState<{
    year: number;
    total_annual_cc: number;
    q1_cc: number;
    q2_cc: number;
    q3_cc: number;
    q4_cc: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/api/admin/budget');
    const j = await res.json();
    setPeriods(j.periods || []);
  };
  useEffect(() => { void load(); }, []);

  const yearGroups: YearGroup[] = useMemo(() => {
    const map = new Map<number, YearGroup>();
    for (const p of periods) {
      // Parse "Q1 2026" → year=2026, q=1
      const match = p.period_name.match(/Q(\d)\s+(\d{4})/);
      if (!match) continue;
      const q = parseInt(match[1], 10);
      const year = parseInt(match[2], 10);
      const group = map.get(year) || { year, total: 0 };
      const key = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
      group[key] = p;
      group.total += p.total_budget_cc;
      map.set(year, group);
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year);
  }, [periods]);

  const saveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    await fetch('/api/admin/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    setEditing(null);
    setSaving(false);
    setMsg(`Saved ${editing.period_name}`);
    setTimeout(() => setMsg(null), 2000);
    await load();
  };

  const saveYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearWizard) return;
    setSaving(true);
    const res = await fetch('/api/admin/budget/year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yearWizard),
    });
    const j = await res.json();
    setSaving(false);
    setYearWizard(null);
    setMsg(j.ok ? `✓ ${yearWizard.year}: ${j.created.length} created, ${j.updated.length} updated` : `✗ ${j.error}`);
    setTimeout(() => setMsg(null), 3000);
    await load();
  };

  const del = async (id: string) => {
    if (!confirm('Delete this quarter? You can re-add it via the year wizard.')) return;
    await fetch(`/api/admin/budget?id=${id}`, { method: 'DELETE' });
    await load();
  };

  const seed2026 = () => {
    setYearWizard({
      year: 2026,
      total_annual_cc: 312_500_000,
      q1_cc: 125_000_000,
      q2_cc: 62_500_000,
      q3_cc: 62_500_000,
      q4_cc: 62_500_000,
    });
  };

  const updateWizardTotal = (total: number) => {
    if (!yearWizard) return;
    // Auto-split remainder if user just set the total
    setYearWizard({ ...yearWizard, total_annual_cc: total });
  };

  const autoSplit = (mode: 'even' | 'frontloaded') => {
    if (!yearWizard) return;
    const t = yearWizard.total_annual_cc;
    if (mode === 'even') {
      const each = Math.floor(t / 4);
      setYearWizard({ ...yearWizard, q1_cc: each, q2_cc: each, q3_cc: each, q4_cc: t - 3 * each });
    } else {
      const q1 = Math.round(t * 0.4);
      const q234 = Math.round(t * 0.2);
      setYearWizard({ ...yearWizard, q1_cc: q1, q2_cc: q234, q3_cc: q234, q4_cc: t - q1 - 2 * q234 });
    }
  };

  const wizardSum = yearWizard ? yearWizard.q1_cc + yearWizard.q2_cc + yearWizard.q3_cc + yearWizard.q4_cc : 0;
  const wizardDelta = yearWizard ? wizardSum - yearWizard.total_annual_cc : 0;

  const newWizard = () => {
    const y = new Date().getFullYear();
    setYearWizard({
      year: y,
      total_annual_cc: 0,
      q1_cc: 0,
      q2_cc: 0,
      q3_cc: 0,
      q4_cc: 0,
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Budget periods</h1>
          <p className="page-sub">
            Set the Canton Coin envelope. Define an annual total and split it across Q1–Q4,
            or edit any quarter individually. Powers the &ldquo;Budget envelope&rdquo; KPI on Overview.
          </p>
        </div>
        <div className="row">
          {periods.length === 0 && (
            <button className="btn btn-ghost" onClick={seed2026}>
              Seed 2026 (312.5M)
            </button>
          )}
          <button className="btn btn-primary" onClick={newWizard}>+ Set up a year</button>
        </div>
      </div>

      {msg && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12.5, color: 'var(--ink-1)' }}>
          {msg}
        </div>
      )}

      {/* Year wizard */}
      {yearWizard && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">Set up a year</h3>
              <p className="card-sub">
                Enter the total annual envelope and how to split it across quarters.
                Existing quarters for that year will be updated, missing ones created.
              </p>
            </div>
          </div>
          <form onSubmit={saveYear} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <Field label="Year">
                <input
                  type="number"
                  min="2020"
                  max="2099"
                  required
                  value={yearWizard.year}
                  onChange={(e) => setYearWizard({ ...yearWizard, year: Number(e.target.value) })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Total annual budget (CC)">
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  required
                  value={yearWizard.total_annual_cc}
                  onChange={(e) => updateWizardTotal(Number(e.target.value))}
                  style={inputStyle}
                  placeholder="e.g. 312500000 for 312.5M"
                />
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                  = {fmtCC(yearWizard.total_annual_cc)} CC
                </div>
              </Field>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => autoSplit('even')}>Auto-split evenly (25/25/25/25)</button>
              <button type="button" className="btn btn-ghost" onClick={() => autoSplit('frontloaded')}>Front-loaded (40/20/20/20)</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {(['q1', 'q2', 'q3', 'q4'] as const).map((q, i) => (
                <Field key={q} label={`Q${i + 1} (CC)`}>
                  <input
                    type="number"
                    min="0"
                    step="1000000"
                    value={yearWizard[`${q}_cc`]}
                    onChange={(e) => setYearWizard({ ...yearWizard, [`${q}_cc`]: Number(e.target.value) })}
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                  />
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>
                    {fmtCC(yearWizard[`${q}_cc`])}
                  </div>
                </Field>
              ))}
            </div>

            <div style={{ fontSize: 12, color: wizardDelta === 0 ? 'var(--ink-3)' : 'var(--warn)' }}>
              Sum of quarters: <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtCC(wizardSum)} CC</span>
              {wizardDelta !== 0 && (
                <> · differs from total by <span style={{ fontFamily: 'var(--font-mono)' }}>{wizardDelta > 0 ? '+' : '−'}{fmtCC(Math.abs(wizardDelta))} CC</span></>
              )}
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : `Save ${yearWizard.year} budget`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setYearWizard(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Single-quarter edit form (re-used) */}
      {editing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3 className="card-title">{editing.id ? `Edit ${editing.period_name}` : 'New period'}</h3>
          </div>
          <form onSubmit={saveSingle} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <Field label="Period name">
              <input
                required
                value={editing.period_name || ''}
                onChange={(e) => setEditing({ ...editing, period_name: e.target.value })}
                placeholder="Q3 2026"
                style={inputStyle}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Start date">
                <input type="date" required value={editing.start_date || ''} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="End date">
                <input type="date" required value={editing.end_date || ''} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <Field label="Total budget (CC)">
              <input
                type="number"
                required
                min="0"
                value={editing.total_budget_cc || 0}
                onChange={(e) => setEditing({ ...editing, total_budget_cc: Number(e.target.value) })}
                style={inputStyle}
              />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)' }}>
              <input
                type="checkbox"
                checked={!!editing.is_current}
                onChange={(e) => setEditing({ ...editing, is_current: e.target.checked })}
              />
              Current quarter
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Per-year rollup */}
      {yearGroups.length === 0 && !yearWizard && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 8 }}>No budget periods yet.</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
            Click <strong>+ Set up a year</strong> above, or
          </div>
          <button className="btn btn-primary" onClick={seed2026}>
            Seed 2026 with 312.5M CC (Q1: 125M · Q2–Q4: 62.5M each)
          </button>
        </div>
      )}

      {yearGroups.map((g) => (
        <div className="card" key={g.year} style={{ marginBottom: 14 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">{g.year} annual budget</h3>
              <p className="card-sub">
                Total: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{fmtCC(g.total)} CC</span>
                {' '}across {[g.q1, g.q2, g.q3, g.q4].filter(Boolean).length} of 4 quarters
              </p>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setYearWizard({
                year: g.year,
                total_annual_cc: g.total,
                q1_cc: g.q1?.total_budget_cc || 0,
                q2_cc: g.q2?.total_budget_cc || 0,
                q3_cc: g.q3?.total_budget_cc || 0,
                q4_cc: g.q4?.total_budget_cc || 0,
              })}
            >
              Edit year
            </button>
          </div>

          {/* Year-wide bar chart */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 14 }}>
            {([g.q1, g.q2, g.q3, g.q4]).map((q, i) => {
              const maxCc = Math.max(g.q1?.total_budget_cc || 0, g.q2?.total_budget_cc || 0, g.q3?.total_budget_cc || 0, g.q4?.total_budget_cc || 0, 1);
              const cc = q?.total_budget_cc || 0;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div
                      style={{
                        width: '100%',
                        height: `${(cc / maxCc) * 100}%`,
                        background: q?.is_current ? 'var(--accent)' : cc > 0 ? 'var(--good)' : 'var(--surface-3)',
                        borderRadius: '3px 3px 0 0',
                        minHeight: 2,
                      }}
                      title={`Q${i + 1}: ${fmtCC(cc)} CC`}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Q{i + 1}</div>
                  <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{fmtCC(cc)}</div>
                </div>
              );
            })}
          </div>

          {/* Quarter rows */}
          <table className="tbl">
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Date range</th>
                <th>% of year</th>
                <th>Current</th>
                <th style={{ textAlign: 'right' }}>Budget (CC)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[g.q1, g.q2, g.q3, g.q4].map((q, i) => {
                if (!q) {
                  return (
                    <tr key={i} style={{ color: 'var(--ink-4)' }}>
                      <td>Q{i + 1}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td className="num">—</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={() => setEditing({
                            period_name: `Q${i + 1} ${g.year}`,
                            start_date: `${g.year}-${String(i * 3 + 1).padStart(2, '0')}-01`,
                            end_date: `${g.year}-${String(i * 3 + 3).padStart(2, '0')}-${i === 0 || i === 2 ? '31' : '30'}`,
                            total_budget_cc: 0,
                          })}
                        >
                          + Add
                        </button>
                      </td>
                    </tr>
                  );
                }
                const pct = g.total ? Math.round((q.total_budget_cc / g.total) * 100) : 0;
                return (
                  <tr key={q.id} className="row">
                    <td><strong>{q.period_name}</strong></td>
                    <td>{fmtDate(new Date(q.start_date))} — {fmtDate(new Date(q.end_date))}</td>
                    <td className="num">{pct}%</td>
                    <td>{q.is_current ? <span style={{ color: 'var(--accent)' }}>● now</span> : ''}</td>
                    <td className="num">{fmtCC(q.total_budget_cc)} <span style={{ color: 'var(--ink-4)' }}>CC</span></td>
                    <td>
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditing(q)}>Edit</button>
                      <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--bad)' }} onClick={() => del(q.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--ink-1)',
  fontFamily: 'inherit',
  fontSize: 13,
};
