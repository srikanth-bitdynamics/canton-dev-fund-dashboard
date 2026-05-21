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

  // Milestones across all approved, broken down by payment-pipeline state
  const approved = data.proposals.filter((p) => p.status === 'approved');
  const allMs = approved.flatMap((p) => p.milestones);
  const inProgressMs = allMs.filter((m) => m.status === 'in-progress');
  const inReviewMs = allMs.filter((m) => m.status === 'in-review');         // In Review for Payment
  const approvedReadyMs = allMs.filter((m) => m.status === 'approved');     // Ready for Payment
  const payingMs = allMs.filter((m) => m.status === 'paying');              // Payment Ready to be Disbursed
  const inProgressCC = inProgressMs.reduce((s, m) => s + m.amount_cc, 0);
  const inReviewCC = inReviewMs.reduce((s, m) => s + m.amount_cc, 0);
  const approvedReadyCC = approvedReadyMs.reduce((s, m) => s + m.amount_cc, 0);
  const payingCC = payingMs.reduce((s, m) => s + m.amount_cc, 0);
  const totalDistributedAllTime = data.payments.reduce((s, p) => s + p.amount_cc, 0);

  // Combined pre-payment queue (review → approved → paying)
  const queuedCC = inReviewCC + approvedReadyCC + payingCC;
  const queuedCount = inReviewMs.length + approvedReadyMs.length + payingMs.length;

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

      {/* KPI strip — payment pipeline left → right */}
      <div className="stat-grid">
        <StatCard
          label="Payment Disbursed (in period)"
          value={
            <>
              <IconCC size={18} />
              <span style={{ marginLeft: 6 }}>{fmtCC(totalPaid)}</span>
            </>
          }
          sub={`${payments.length} transactions · ${fmtCC(totalDistributedAllTime)} all-time`}
        >
          {trendValues.length > 0 && (
            <div className="sparkbox">
              <Sparkline values={trendValues} stroke="var(--good)" />
            </div>
          )}
        </StatCard>

        <StatCard
          label="Payment pipeline (queued)"
          value={fmtCC(queuedCC)}
          sub={`${queuedCount} milestone${queuedCount === 1 ? '' : 's'} between review and on-chain release`}
        >
          {/* Mini breakdown by sub-state */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, fontSize: 11 }}>
            <PipelineRow
              dot="var(--ms-review)"
              label="In Review for Payment"
              count={inReviewMs.length}
              cc={inReviewCC}
            />
            <PipelineRow
              dot="var(--ms-approved)"
              label="Ready for Payment"
              count={approvedReadyMs.length}
              cc={approvedReadyCC}
            />
            <PipelineRow
              dot="var(--ms-paying)"
              label="Payment Ready to be Disbursed"
              count={payingMs.length}
              cc={payingCC}
            />
          </div>
        </StatCard>

        <StatCard
          label="In Progress"
          value={fmtCC(inProgressCC)}
          sub={`${inProgressMs.length} milestone${inProgressMs.length === 1 ? '' : 's'} being delivered`}
        />

        <StatCard
          label="Total Approved"
          value={fmtCC(approved.reduce((s, p) => s + p.amount_cc, 0))}
          sub={`${approved.length} approved project${approved.length === 1 ? '' : 's'} · all-time commitment`}
          delta={(() => {
            const committed = approved.reduce((s, p) => s + p.amount_cc, 0);
            if (committed === 0) return 'No commitments yet';
            const pct = Math.round((totalDistributedAllTime / committed) * 100);
            return `${pct}% disbursed · ${fmtCC(committed - totalDistributedAllTime)} remaining`;
          })()}
          deltaTone="pos"
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
  const ticks = niceTicks(max, 4);
  const chartMax = ticks[ticks.length - 1];
  const Y_AXIS_W = 52;
  const CHART_H = 180;
  const X_LABEL_H = 22;

  return (
    // Outer flex row: [Y axis] [chart column]
    // Chart column is a flex column: [bars area] [x labels row]
    // No absolute positioning at the outer scope — everything scrolls together
    <div style={{ display: 'flex', height: CHART_H + X_LABEL_H + 8, paddingTop: 8 }}>
      {/* Y axis labels — positioned relative to its own container */}
      <div
        style={{
          width: Y_AXIS_W,
          height: CHART_H,
          position: 'relative',
          flexShrink: 0,
          borderRight: '1px solid var(--line)',
        }}
      >
        {ticks.map((t) => (
          <div
            key={t}
            style={{
              position: 'absolute',
              right: 8,
              bottom: `${(t / chartMax) * 100}%`,
              transform: 'translateY(50%)',
              fontSize: 10,
              color: 'var(--ink-4)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}
          >
            {fmtChartCC(t)}
          </div>
        ))}
      </div>

      {/* Chart column — bars on top, X labels directly below */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Bars area with gridlines */}
        <div style={{ position: 'relative', height: CHART_H, width: '100%' }}>
          {ticks.map((t) => (
            <div
              key={`grid-${t}`}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${(t / chartMax) * 100}%`,
                height: 1,
                background: t === 0 ? 'var(--line)' : 'var(--line-soft)',
                opacity: t === 0 ? 1 : 0.5,
              }}
            />
          ))}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              height: '100%',
              padding: '0 4px',
              position: 'relative',
            }}
          >
            {data.map((b) => (
              <div
                key={b.label}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  title={`${b.label}: ${b.amount.toLocaleString()} CC · ${b.count} payment${b.count === 1 ? '' : 's'}`}
                  style={{
                    width: '100%',
                    maxWidth: 36,
                    height: `${(b.amount / chartMax) * 100}%`,
                    background:
                      b.amount > 0
                        ? 'linear-gradient(180deg, var(--good) 0%, color-mix(in oklch, var(--good) 70%, transparent) 100%)'
                        : 'transparent',
                    border: b.amount === 0 ? '1px dashed var(--line)' : 'none',
                    borderRadius: '4px 4px 0 0',
                    minHeight: b.amount > 0 ? 2 : 0,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* X axis labels — same flex container as bars, no absolute positioning */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '6px 4px 0',
            height: X_LABEL_H,
            alignItems: 'flex-start',
          }}
        >
          {data.map((b) => (
            <div
              key={`label-${b.label}`}
              style={{
                flex: 1,
                fontSize: 10,
                color: 'var(--ink-4)',
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
              }}
            >
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Pick "nice" round tick values for a chart axis. */
function niceTicks(max: number, n: number): number[] {
  if (max <= 0) return [0, 1];
  const roughStep = max / (n - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceStep: number;
  if (normalized < 1.5) niceStep = 1 * magnitude;
  else if (normalized < 3) niceStep = 2 * magnitude;
  else if (normalized < 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const ticks: number[] = [];
  let v = 0;
  while (v <= max + niceStep / 2) {
    ticks.push(v);
    v += niceStep;
  }
  return ticks;
}

/** Compact CC formatter for chart axis labels. */
function fmtChartCC(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function PipelineRow({
  dot,
  label,
  count,
  cc,
}: {
  dot: string;
  label: string;
  count: number;
  cc: number;
}) {
  const muted = count === 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: muted ? 'var(--ink-4)' : 'var(--ink-2)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 50,
          background: muted ? 'var(--surface-3)' : dot,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, fontSize: 11 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {count} <span style={{ color: 'var(--ink-4)' }}>·</span> {fmtCC(cc)}
      </span>
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
