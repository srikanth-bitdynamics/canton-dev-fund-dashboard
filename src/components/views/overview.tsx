'use client';

import { useMemo } from 'react';
import type { AppData, Period, Proposal, VotingProposal, ActivityItem } from '@/lib/types';
import { fmtCC, fmtDate, relTime, statusMeta, milestoneStatusMeta, inRange, budgetForRange } from '@/lib/utils';
import { IconCC, IconFilter, IconExport, IconCheck, IconX } from '@/components/ui/icons';
import { Pill, StatCard, SegmentedBar, Sparkline, Donut, Chip } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface MsRowProps {
  color: string;
  label: string;
  n: number;
  total: number;
}

function MsRow({ color, label, n, total }: MsRowProps) {
  return (
    <div className="row" style={{ gap: 8, fontSize: 12 }}>
      <span
        className="legend-sw"
        style={{ background: color, width: 10, height: 10, borderRadius: 3 }}
      />
      <span>{label}</span>
      <span className="grow" style={{ flex: 1 }} />
      <span
        className="num"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}
      >
        {n}
      </span>
      <span
        style={{
          color: 'var(--ink-4)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {total > 0 ? Math.round((n / total) * 100) : 0}%
      </span>
    </div>
  );
}

/* ---------- CategoryBudgetChart ---------- */

interface CategoryBudgetChartProps {
  data: AppData;
  approved: Proposal[];
  quarterBudget: number;
}

function CategoryBudgetChart({ data, approved, quarterBudget }: CategoryBudgetChartProps) {
  const envelopeShares: Record<string, number> = {
    protocol: 0.32,
    devtools: 0.18,
    security: 0.16,
    reference: 0.14,
    infra: 0.12,
    defi: 0.08,
  };

  const rows = data.CATEGORIES.map((c) => {
    const props = approved.filter((p) => p.category === c.id);
    const committed = props.reduce((s, p) => s + p.amount_cc, 0);
    const distributed = props.reduce(
      (s, p) =>
        s +
        p.milestones
          .filter((m) => m.status === 'delivered')
          .reduce((ss, m) => ss + m.amount_cc, 0),
      0,
    );
    const envelopeShare = envelopeShares[c.id] ?? 0.1;
    return { cat: c, envelope: quarterBudget * envelopeShare, committed, distributed };
  });

  const max = Math.max(...rows.map((r) => r.envelope), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => (
        <div key={r.cat.id}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="row" style={{ gap: 8, fontSize: 12.5 }}>
              <span
                className="tag-dot"
                style={{
                  background: `var(--cat-${r.cat.tone})`,
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  display: 'inline-block',
                }}
              />
              <span>{r.cat.label}</span>
            </div>
            <div
              className="row"
              style={{
                gap: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: 'var(--ink-3)',
              }}
            >
              <span style={{ color: 'var(--good)' }}>{fmtCC(r.distributed)}</span>
              <span style={{ color: 'var(--accent)' }}>{fmtCC(r.committed)}</span>
              <span>/ {fmtCC(r.envelope)}</span>
            </div>
          </div>
          {/* Stacked horizontal bar */}
          <div
            style={{
              position: 'relative',
              height: 18,
              background: 'var(--surface-2)',
              borderRadius: 999,
              overflow: 'hidden',
              border: '1px solid var(--line-soft)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(r.envelope / max) * 100}%`,
                background: 'oklch(0.30 0.025 250)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(r.committed / max) * 100}%`,
                background: `color-mix(in oklch, var(--cat-${r.cat.tone}) 70%, transparent)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(r.distributed / max) * 100}%`,
                background: `var(--cat-${r.cat.tone})`,
              }}
            />
          </div>
        </div>
      ))}
      <div className="legend" style={{ marginTop: 4 }}>
        <span className="legend-item">
          <span className="legend-sw" style={{ background: 'oklch(0.30 0.025 250)' }} /> Envelope
        </span>
        <span className="legend-item">
          <span
            className="legend-sw"
            style={{ background: 'color-mix(in oklch, var(--cat-a) 70%, transparent)' }}
          />{' '}
          Committed
        </span>
        <span className="legend-item">
          <span className="legend-sw" style={{ background: 'var(--cat-a)' }} /> Distributed
        </span>
      </div>
    </div>
  );
}

/* ---------- Pipeline ---------- */

interface PipelineProps {
  proposals: Proposal[];
}

function Pipeline({ proposals }: PipelineProps) {
  const stages = [
    { id: 'submitted', label: 'Submitted', tone: 'var(--s-submitted)' },
    { id: 'champion-review', label: 'Champion', tone: 'var(--s-champion)' },
    { id: 'tech-review', label: 'Tech review', tone: 'var(--s-tech)' },
    { id: 'voting', label: 'Voting', tone: 'var(--s-voting)' },
    { id: 'approved', label: 'Approved', tone: 'var(--s-approved)' },
    { id: 'declined', label: 'Declined', tone: 'var(--s-declined)' },
  ];
  const max = Math.max(...stages.map((s) => proposals.filter((p) => p.status === s.id).length), 1);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
        gap: 10,
      }}
    >
      {stages.map((s) => {
        const n = proposals.filter((p) => p.status === s.id).length;
        const sumCC = proposals
          .filter((p) => p.status === s.id)
          .reduce((acc, p) => acc + p.amount_cc, 0);
        return (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--ink-3)' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 50,
                  background: s.tone,
                  display: 'inline-block',
                }}
              />
              {s.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {n}
            </div>
            <div
              style={{
                height: 4,
                background: 'var(--surface-2)',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: s.tone }} />
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {fmtCC(sumCC)} CC
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- WeekStrip ---------- */

interface WeekStripProps {
  approved: Proposal[];
}

interface WeekEvent {
  proposal: Proposal;
  milestone: Proposal['milestones'][number];
}

interface WeekCell {
  day: string;
  date: Date;
  events: WeekEvent[];
  isToday: boolean;
}

function WeekStrip({ approved }: WeekStripProps) {
  const today = new Date();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const cells: WeekCell[] = days.map((d, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const events: WeekEvent[] = [];
    approved.forEach((p) => {
      p.milestones.forEach((m) => {
        const due = new Date(m.due);
        if (due.toDateString() === date.toDateString() && m.status !== 'delivered') {
          events.push({ proposal: p, milestone: m });
        }
      });
    });
    return { day: d, date, events, isToday: date.toDateString() === today.toDateString() };
  });

  return (
    <div className="weekstrip">
      {cells.map((c, i) => (
        <div key={i} className={`weekday ${c.isToday ? 'today' : ''}`}>
          <div className="weekday-head">
            <span className="weekday-name">{c.day}</span>
            <span className="weekday-num">{c.date.getDate()}</span>
          </div>
          {c.events.slice(0, 2).map((e, j) => (
            <div
              key={j}
              className="weekday-event ms"
              title={`${e.proposal.title} · ${e.milestone.id}`}
            >
              {e.milestone.id}
            </div>
          ))}
          {c.events.length > 2 && (
            <div className="weekday-event" style={{ color: 'var(--ink-3)' }}>
              +{c.events.length - 2} more
            </div>
          )}
          {c.events.length === 0 && c.day === 'Fri' && (
            <div className="weekday-event vote">Vote closes</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- FeedItem ---------- */

interface FeedItemProps {
  a: ActivityItem;
}

function FeedItem({ a }: FeedItemProps) {
  const glyphTone =
    a.kind === 'milestone-delivered'
      ? 'good'
      : a.kind === 'payment-released'
        ? 'good'
        : a.kind === 'proposal-approved'
          ? 'good'
          : a.kind === 'proposal-declined'
            ? 'bad'
            : 'info';

  const glyph =
    a.kind === 'milestone-delivered' ? (
      <IconCheck size={11} />
    ) : a.kind === 'payment-released' ? (
      <IconCC size={12} />
    ) : a.kind === 'proposal-approved' ? (
      <IconCheck size={11} />
    ) : a.kind === 'proposal-declined' ? (
      <IconX size={11} />
    ) : (
      <span>&bull;</span>
    );

  return (
    <div className="feed-item">
      <div className={`feed-glyph ${glyphTone}`}>{glyph}</div>
      <div className="feed-body">
        <div className="feed-title">
          <strong style={{ fontWeight: 500 }}>{a.title}</strong>
          {a.amount_cc != null && (
            <>
              {' '}
              &middot;{' '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtCC(a.amount_cc)} CC</span>
            </>
          )}
        </div>
        <div className="feed-meta">
          <span style={{ fontFamily: 'var(--font-mono)' }}>{a.proposal_id}</span> &middot;{' '}
          {a.proposal_title.length > 40
            ? a.proposal_title.slice(0, 40) + '…'
            : a.proposal_title}{' '}
          &middot; {a.who} &middot; {relTime(a.when)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OverviewView                                                       */
/* ------------------------------------------------------------------ */

interface OverviewViewProps {
  data: AppData;
  period: Period;
  signedIn: boolean;
  openProposal: (p: Proposal) => void;
}

export default function OverviewView({ data, period, signedIn, openProposal }: OverviewViewProps) {
  const { from, to } = period;

  const defined = budgetForRange(data.QUARTERS, from, to);

  const inPeriod = data.proposals.filter((p) => inRange(p.submitted_at, from, to));
  const approved = data.proposals.filter((p) => p.status === 'approved');
  const approvedInP = approved.filter((p) => inRange(p.submitted_at, from, to));

  const committed = approvedInP.reduce((s, p) => s + p.amount_cc, 0);
  const paymentsInPeriod = data.payments.filter((pm) => inRange(pm.released_at, from, to));
  const distributed = paymentsInPeriod.reduce((s, p) => s + p.amount_cc, 0);
  const pendingAsk = inPeriod
    .filter((p) =>
      ['submitted', 'champion-review', 'tech-review', 'voting'].includes(p.status),
    )
    .reduce((s, p) => s + p.amount_cc, 0);
  const remaining = defined - committed;

  // Week-over-week deltas — comparable to a stored baseline. Until we track history,
  // estimate as ~10% of current value (a placeholder until Phase 7 cron writes weekly snapshots).
  const committedDelta = Math.round(committed * 0.08);
  const distributedDelta = Math.round(distributed * 0.15);
  const fmtDelta = (n: number) => (n >= 0 ? `+${fmtCC(n)}` : `−${fmtCC(Math.abs(n))}`);

  // Milestones across all approved (Board #5 columns mapped to dashboard states)
  const allMs = approved.flatMap((p) => p.milestones);
  const deliveredCount = allMs.filter((m) => m.status === 'delivered').length;
  const payingCount = allMs.filter((m) => m.status === 'paying').length;
  const approvedReadyCount = allMs.filter((m) => m.status === 'approved').length;
  const inReview = allMs.filter((m) => m.status === 'in-review').length;
  const inProg = allMs.filter((m) => m.status === 'in-progress').length;
  const atRisk = allMs.filter((m) => m.status === 'at-risk').length;
  const planned = allMs.filter((m) => m.status === 'planned').length;
  const totalMs = allMs.length;

  // Sparkline trends
  const trendDistributed = [120, 180, 210, 260, 320, 410, 480, 560, 690];
  const trendCommitted = [800, 900, 1200, 1500, 1800, 2200, 2600, 3000, 3400];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Committee overview &mdash; {period.label}</h1>
          <p className="page-sub">
            Programmatic budget envelope and milestone delivery for the Canton Protocol
            Development Fund. All figures denominated in Canton Coin (CC).
          </p>
        </div>
        <div className="row">
          <button className="btn btn-ghost">
            <IconExport /> Export report
          </button>
          <button className="btn">
            <IconFilter /> Filters
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="stat-grid">
        <StatCard
          label="Budget envelope"
          value={
            <>
              <IconCC size={18} />{' '}
              <span style={{ marginLeft: 6 }}>{fmtCC(defined)}</span>
            </>
          }
          sub={`Defined for ${period.label} · CIP-0100 envelope`}
        >
          <div style={{ marginTop: 10 }}>
            <SegmentedBar
              total={defined}
              segments={[
                { value: distributed, color: 'var(--good)', label: 'Distributed' },
                { value: committed - distributed, color: 'var(--accent)', label: 'Committed' },
                { value: pendingAsk * 0.35, color: 'var(--warn)', label: 'Pending (est)' },
              ]}
            />
            <div
              className="row"
              style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)', gap: 14 }}
            >
              <span>
                <span
                  className="legend-sw"
                  style={{
                    background: 'var(--good)',
                    display: 'inline-block',
                    marginRight: 4,
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                  }}
                />{' '}
                Distributed
              </span>
              <span>
                <span
                  className="legend-sw"
                  style={{
                    background: 'var(--accent)',
                    display: 'inline-block',
                    marginRight: 4,
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                  }}
                />{' '}
                Committed
              </span>
              <span>
                <span
                  className="legend-sw"
                  style={{
                    background: 'var(--warn)',
                    display: 'inline-block',
                    marginRight: 4,
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                  }}
                />{' '}
                Pending
              </span>
            </div>
          </div>
        </StatCard>

        <StatCard
          label="Committed (approved)"
          value={fmtCC(committed)}
          sub={`${approvedInP.length} proposals · ${defined ? Math.round((committed / defined) * 100) : 0}% of budget`}
          delta={`${fmtDelta(committedDelta)} vs last week`}
          deltaTone={committedDelta >= 0 ? 'pos' : 'neg'}
        >
          <div className="sparkbox">
            <Sparkline values={trendCommitted} stroke="var(--accent)" />
          </div>
        </StatCard>

        <StatCard
          label="Distributed (paid)"
          value={fmtCC(distributed)}
          sub={`${paymentsInPeriod.length} milestone payouts · ${committed ? Math.min(100, Math.round((distributed / committed) * 100)) : 0}% of committed`}
          delta={`${fmtDelta(distributedDelta)} this week`}
          deltaTone={distributedDelta >= 0 ? 'pos' : 'neg'}
        >
          <div className="sparkbox">
            <Sparkline values={trendDistributed} stroke="var(--good)" />
          </div>
        </StatCard>

        <StatCard
          label="Remaining headroom"
          value={fmtCC(remaining)}
          sub={`Pending review asks: ${fmtCC(pendingAsk)}`}
          delta={remaining < pendingAsk ? 'Pending exceeds headroom' : 'Within budget'}
          deltaTone={remaining < pendingAsk ? 'warn' : 'pos'}
        />
      </div>

      {/* Row: budget chart + milestone tracker */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Budget by category &mdash; {period.label}</h3>
              <p className="card-sub">Defined envelope vs. committed and distributed</p>
            </div>
            <div className="row">
              <button className="btn btn-ghost" style={{ fontSize: 11 }}>
                Stacked
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}>
                Pareto
              </button>
            </div>
          </div>
          <CategoryBudgetChart data={data} approved={approvedInP} quarterBudget={defined} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Milestones &mdash; anticipated vs delivered</h3>
              <p className="card-sub">Across {approved.length} approved projects</p>
            </div>
            <Pill tone="info">
              {deliveredCount}/{totalMs}
            </Pill>
          </div>
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            <Donut
              size={132}
              thickness={16}
              slices={[
                { value: deliveredCount, color: 'var(--ms-delivered)', label: 'Payment Disbursed' },
                { value: payingCount, color: 'var(--ms-paying)', label: 'Payment Ready' },
                { value: approvedReadyCount, color: 'var(--ms-approved)', label: 'Ready for Payment' },
                { value: inReview, color: 'var(--ms-review)', label: 'In Review' },
                { value: inProg, color: 'var(--ms-progress)', label: 'In Progress' },
                { value: atRisk, color: 'var(--ms-risk)', label: 'At risk' },
                { value: planned, color: 'var(--surface-3)', label: 'Planned' },
              ]}
              centerLabel={`${totalMs > 0 ? Math.round((deliveredCount / totalMs) * 100) : 0}%`}
              centerSub="Disbursed"
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <MsRow color="var(--ms-delivered)" label="Payment Disbursed" n={deliveredCount} total={totalMs} />
              <MsRow color="var(--ms-paying)" label="Payment Ready" n={payingCount} total={totalMs} />
              <MsRow color="var(--ms-approved)" label="Ready for Payment" n={approvedReadyCount} total={totalMs} />
              <MsRow color="var(--ms-review)" label="In Review" n={inReview} total={totalMs} />
              <MsRow color="var(--ms-progress)" label="In Progress" n={inProg} total={totalMs} />
              <MsRow color="var(--ms-risk)" label="At risk" n={atRisk} total={totalMs} />
              <MsRow color="var(--surface-3)" label="Planned" n={planned} total={totalMs} />
            </div>
          </div>
        </div>
      </div>

      {/* Voting queue snapshot + Activity */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">This week&rsquo;s voting queue</h3>
              <p className="card-sub">
                {data.votingQueue.length} proposals &mdash; reviews close Fri 5pm UTC
              </p>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11 }}>
              Open queue &rarr;
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {data.votingQueue.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="vote-card"
                onClick={() => openProposal(p)}
                style={{ cursor: 'pointer' }}
              >
                <div className="vote-card-head">
                  <span
                    className="mono"
                    style={{
                      color: 'var(--ink-3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  >
                    {p.id}
                  </span>
                  <Pill tone="info" dot={statusMeta[p.status]?.dot}>
                    {statusMeta[p.status]?.label}
                  </Pill>
                </div>
                <div className="vote-card-title">{p.title}</div>
                <div className="vote-card-sub">
                  {p.applicant} &middot; Champion {p.champion} &middot; {p.milestones.length}{' '}
                  milestones
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row" style={{ gap: 6 }}>
                    <IconCC size={12} />
                    <span className="num" style={{ fontFamily: 'var(--font-mono)' }}>
                      {fmtCC(p.amount_cc)}
                    </span>
                  </span>
                  {p.pr_number > 0 && (
                    <a
                      href={`https://github.com/canton-foundation/canton-dev-fund/pull/${p.pr_number}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--accent)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Vote on GitHub &rarr;
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Activity</h3>
              <p className="card-sub">Recent committee actions and payouts</p>
            </div>
          </div>
          <div className="feed scrollbox">
            {data.activity.slice(0, 10).map((a) => (
              <FeedItem key={a.id} a={a} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: pipeline + week strip */}
      <div className="grid-asym">
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Pipeline funnel</h3>
              <p className="card-sub">Proposals by stage (program-wide)</p>
            </div>
          </div>
          <Pipeline proposals={data.proposals} />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Upcoming milestone deliveries</h3>
              <p className="card-sub">Next 7 days</p>
            </div>
          </div>
          <WeekStrip approved={approved} />
        </div>
      </div>
    </>
  );
}
