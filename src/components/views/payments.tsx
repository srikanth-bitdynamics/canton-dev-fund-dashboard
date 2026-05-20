'use client';

import type { AppData, Period, Payment, Milestone, Proposal } from '@/lib/types';
import { fmtCC, fmtDate, inRange } from '@/lib/utils';
import { IconExport, IconSearch, IconCC } from '@/components/ui/icons';
import { StatCard, Sparkline } from '@/components/ui/primitives';

interface PaymentsViewProps {
  data: AppData;
  period: Period;
}

export default function PaymentsView({ data, period }: PaymentsViewProps) {
  // Period-filtered payments
  const payments = data.payments.filter((pm) => inRange(pm.released_at, period.from, period.to));
  const totalPaid = payments.reduce((s, p) => s + p.amount_cc, 0);
  const recipients = new Set(payments.map((p) => p.applicant)).size;

  // Outstanding commitments — approved milestones that are NOT delivered yet
  const approved = data.proposals.filter((p) => p.status === 'approved');
  const outstandingMilestones = approved.flatMap((p) =>
    p.milestones.filter((m) => m.status !== 'delivered'),
  );
  const outstandingCC = outstandingMilestones.reduce((s, m) => s + m.amount_cc, 0);

  // Pace vs plan: if period has a target, see what fraction released
  // Heuristic until a real "planned schedule" exists: assume linear burn of total approved across the period
  const totalCommittedAllTime = approved.reduce((s, p) => s + p.amount_cc, 0);
  const totalDistributedAllTime = data.payments.reduce((s, p) => s + p.amount_cc, 0);
  const pacePct = totalCommittedAllTime > 0
    ? Math.round((totalDistributedAllTime / totalCommittedAllTime) * 100)
    : 0;

  // Disbursement trend — monthly buckets for the last 12 months
  const trend = buildMonthlyTrend(data.payments, 12);
  const trendValues = trend.map((t) => t.amount);

  // Top recipients (all-time, not just period — gives full picture of concentration)
  const recipientTotals = aggregateByRecipient(data.payments);
  const topRecipients = recipientTotals.slice(0, 5);

  // Upcoming payments — milestones due to deliver in next 30 days from approved proposals
  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(now.getDate() + 30);
  const upcoming: { proposal: Proposal; milestone: Milestone }[] = [];
  approved.forEach((p) => {
    p.milestones.forEach((m) => {
      if (m.status !== 'delivered' && m.due >= now && m.due <= in30Days) {
        upcoming.push({ proposal: p, milestone: m });
      }
    });
  });
  upcoming.sort((a, b) => a.milestone.due.getTime() - b.milestone.due.getTime());
  const upcomingTotal = upcoming.reduce((s, u) => s + u.milestone.amount_cc, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Payments ledger</h1>
          <p className="page-sub">
            On-chain disbursements in{' '}
            <strong style={{ color: 'var(--ink-1)' }}>{period.label}</strong>. Per CIP-0100,
            recipients mint Canton Coin directly when milestones are verified &mdash; funds do not
            route through the Foundation.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-ghost">
            <IconExport /> Export CSV
          </button>
          <button className="btn btn-ghost">Sync with chain</button>
        </div>
      </div>

      {/* KPI strip — replaced Avg ticket / Largest with Outstanding + Pace */}
      <div className="stat-grid">
        <StatCard
          label="Released in period"
          value={
            <>
              <IconCC size={18} />
              <span style={{ marginLeft: 6 }}>{fmtCC(totalPaid)}</span>
            </>
          }
          sub={`${payments.length} transactions`}
        >
          {trendValues.length > 0 && (
            <div className="sparkbox">
              <Sparkline values={trendValues} stroke="var(--good)" />
            </div>
          )}
        </StatCard>
        <StatCard
          label="Outstanding commitments"
          value={fmtCC(outstandingCC)}
          sub={`${outstandingMilestones.length} approved milestones, unpaid`}
          delta={outstandingCC > totalPaid * 10 ? 'High overhang' : 'Within range'}
          deltaTone={outstandingCC > totalPaid * 10 ? 'warn' : 'pos'}
        />
        <StatCard
          label="Pace vs plan"
          value={`${pacePct}%`}
          sub={`Distributed / committed (all approved)`}
          delta={pacePct < 25 ? 'Behind schedule' : pacePct < 75 ? 'On track' : 'Near complete'}
          deltaTone={pacePct < 25 ? 'warn' : 'pos'}
        />
        <StatCard
          label="Recipients in period"
          value={recipients}
          sub={`${recipientTotals.length} unique recipients all-time`}
        />
      </div>

      {/* Trend chart + Top recipients */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Disbursement trend</h3>
              <p className="card-sub">Last 12 months &mdash; CC released per month</p>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>
              total {fmtCC(totalDistributedAllTime)}
            </span>
          </div>
          <MonthlyBars data={trend} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Top recipients</h3>
              <p className="card-sub">All-time CC received &mdash; concentration check</p>
            </div>
          </div>
          {topRecipients.length === 0 && (
            <div className="empty" style={{ padding: '20px 0' }}>No payments recorded yet.</div>
          )}
          {topRecipients.map((r, i) => (
            <div key={r.applicant} style={{ marginBottom: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12.5 }}>
                  <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginRight: 6 }}>{i + 1}.</span>
                  {r.applicant}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>
                  {fmtCC(r.amount_cc)} <span style={{ color: 'var(--ink-4)' }}>· {r.count}×</span>
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(r.amount_cc / topRecipients[0].amount_cc) * 100}%`,
                    height: '100%',
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming payments */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Upcoming payments &mdash; next 30 days</h3>
            <p className="card-sub">
              {upcoming.length} milestone{upcoming.length === 1 ? '' : 's'} due
              {upcomingTotal > 0 && (
                <> &middot; <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warn)' }}>{fmtCC(upcomingTotal)} CC</span> at stake</>
              )}
            </p>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>No milestones due in the next 30 days.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Due</th>
                <th>Project</th>
                <th>Milestone</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.slice(0, 8).map((u, i) => {
                const daysOut = Math.ceil((u.milestone.due.getTime() - now.getTime()) / 86_400_000);
                return (
                  <tr key={i} className="row">
                    <td>
                      <div style={{ fontSize: 12 }}>{fmtDate(u.milestone.due, { long: true })}</div>
                      <div style={{ fontSize: 10.5, color: daysOut < 7 ? 'var(--warn)' : 'var(--ink-3)' }}>
                        in {daysOut}d
                      </div>
                    </td>
                    <td>{u.proposal.title.length > 48 ? u.proposal.title.slice(0, 48) + '…' : u.proposal.title}</td>
                    <td className="mono">{u.milestone.id}</td>
                    <td><span className="pill pill-soft">{u.milestone.status}</span></td>
                    <td className="num">{fmtCC(u.milestone.amount_cc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Full ledger */}
      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <div className="search" style={{ minWidth: 240 }}>
            <IconSearch />
            <input placeholder="Search by tx, applicant, milestone…" />
          </div>
          <div className="grow" />
          <span className="muted" style={{ fontSize: 12 }}>
            {payments.length} payments
          </span>
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Milestone</th>
                <th>Project</th>
                <th>Recipient</th>
                <th>Tx</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No payments released in {period.label}.
                  </td>
                </tr>
              )}
              {payments.map((pm, i) => (
                <tr key={i} className="row">
                  <td style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                    {fmtDate(pm.released_at, { long: true })}
                  </td>
                  <td className="mono" style={{ color: 'var(--ink-1)' }}>{pm.milestone_id}</td>
                  <td>{pm.proposal_title.length > 50 ? pm.proposal_title.slice(0, 50) + '…' : pm.proposal_title}</td>
                  <td>{pm.applicant}</td>
                  <td className="mono">{pm.tx}</td>
                  <td className="num">
                    {fmtCC(pm.amount_cc)} <span style={{ color: 'var(--ink-4)' }}>CC</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface MonthBucket {
  label: string; // "May 26"
  amount: number;
  count: number;
}

function buildMonthlyTrend(payments: Payment[], months: number): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      label: d.toLocaleString('en', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(-2),
      amount: 0,
      count: 0,
    });
  }
  payments.forEach((pm) => {
    const pd = new Date(pm.released_at);
    const idx = (pd.getFullYear() - now.getFullYear()) * 12 + (pd.getMonth() - now.getMonth()) + (months - 1);
    if (idx >= 0 && idx < months) {
      buckets[idx].amount += pm.amount_cc;
      buckets[idx].count += 1;
    }
  });
  return buckets;
}

function MonthlyBars({ data }: { data: MonthBucket[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, padding: '8px 0 16px', position: 'relative' }}>
      {data.map((b) => (
        <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div
              title={`${b.label}: ${b.amount.toLocaleString()} CC · ${b.count} payments`}
              style={{
                width: '100%',
                height: `${(b.amount / max) * 100}%`,
                background: b.amount > 0 ? 'var(--good)' : 'var(--surface-3)',
                borderRadius: '3px 3px 0 0',
                minHeight: 2,
                transition: 'background .15s',
              }}
            />
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--ink-4)', textAlign: 'center', whiteSpace: 'nowrap' }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

function aggregateByRecipient(payments: Payment[]): { applicant: string; amount_cc: number; count: number }[] {
  const map = new Map<string, { amount_cc: number; count: number }>();
  payments.forEach((p) => {
    const e = map.get(p.applicant) || { amount_cc: 0, count: 0 };
    e.amount_cc += p.amount_cc;
    e.count += 1;
    map.set(p.applicant, e);
  });
  return Array.from(map.entries())
    .map(([applicant, v]) => ({ applicant, ...v }))
    .sort((a, b) => b.amount_cc - a.amount_cc);
}
