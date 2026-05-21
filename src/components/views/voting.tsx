'use client';

import type { AppData, Proposal } from '@/lib/types';
import { fmtCC, fmtDate, statusMeta } from '@/lib/utils';
import { IconCC } from '@/components/ui/icons';
import { Pill, StatCard } from '@/components/ui/primitives';

interface VotingViewProps {
  data: AppData;
  signedIn: boolean;
  openProposal: (p: Proposal) => void;
}

export default function VotingView({ data, openProposal }: VotingViewProps) {
  // Headroom is computed against the current quarter envelope (from budget config).
  // Fallback to the latest defined quarter if no quarter is flagged current.
  const currentQuarter =
    data.QUARTERS.find((q) => q.current) ||
    data.QUARTERS[data.QUARTERS.length - 1];
  const qEnvelope = currentQuarter?.defined ?? 0;
  const qLabel = currentQuarter?.label ?? '—';
  const qCommitted = data.proposals
    .filter((p) => p.status === 'approved' && p.quarter === currentQuarter?.id)
    .reduce((s, p) => s + p.amount_cc, 0);
  const askThisWeek = data.votingQueue.reduce((s, p) => s + p.amount_cc, 0);
  const headroom = qEnvelope - qCommitted - askThisWeek;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">This week&rsquo;s voting</h1>
          <p className="page-sub">
            Proposals open for committee vote. Voting happens on GitHub via the{' '}
            <a
              href="https://github.com/cncf-tags/gitvote"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              gitvote
            </a>
            {' '}bot — click <strong>Vote on GitHub</strong> below to comment your vote.
            Mirrors <span style={{ fontFamily: 'var(--font-mono)' }}>projects/3/views/1</span>.
          </p>
        </div>
        <div className="row">
          <Pill tone="warn">{data.votingQueue.length} pending</Pill>
          <Pill tone="info">{data.CHAMPIONS.length} committee members</Pill>
        </div>
      </div>

      {/* Total ask for the week + budget impact */}
      <div className="grid-3">
        <StatCard
          label="Total ask this week"
          value={fmtCC(askThisWeek)}
          sub={`Across ${data.votingQueue.length} proposals`}
        />
        <StatCard
          label="Headroom if all approved"
          value={headroom >= 0 ? fmtCC(headroom) : `−${fmtCC(Math.abs(headroom))}`}
          sub={qEnvelope > 0
            ? `${qLabel} envelope ${fmtCC(qEnvelope)} − committed ${fmtCC(qCommitted)} − this batch`
            : `No envelope defined for ${qLabel} (set in /admin/budget)`}
          deltaTone={headroom < 0 ? 'warn' : 'pos'}
        />
        <StatCard label="Quorum target" value="5 / 8" sub="Tech & Ops Committee members must vote" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {data.votingQueue.map((p) => {
          const cat = data.CATEGORIES.find((c) => c.id === p.category);
          return (
            <div
              key={p.id}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 8 }}>
                  <span
                    className="mono"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--ink-3)',
                    }}
                  >
                    {p.id}
                  </span>
                  <Pill tone="warn" dot={statusMeta[p.status]?.dot}>
                    Voting
                  </Pill>
                  {cat && (
                    <span className="tag">
                      <span
                        className="tag-dot"
                        style={{ background: `var(--cat-${cat.tone})` }}
                      />
                      {cat.label}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  Reviews close {fmtDate(p.reviews_due, { long: false })}
                </span>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    marginBottom: 4,
                  }}
                >
                  {p.title}
                </div>
                <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                  {p.applicant} &middot; Champion {p.champion}
                </div>
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Ask
                  </div>
                  <div
                    className="row"
                    style={{
                      gap: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  >
                    <IconCC size={14} /> {fmtCC(p.amount_cc)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Milestones
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  >
                    {p.milestones.length}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 4,
                    }}
                  >
                    Champion
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{p.champion}</div>
                </div>
              </div>

              <div className="vote-actions">
                {p.pr_number > 0 && (
                  <a
                    className="btn btn-primary"
                    href={`https://github.com/canton-foundation/canton-dev-fund/pull/${p.pr_number}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Voting happens via gitvote comments on the PR"
                  >
                    Vote on GitHub &rarr;
                  </a>
                )}
                <a
                  className="btn"
                  href={`/proposals/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Proposal page
                </a>
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => openProposal(p)}
                >
                  Quick view &rarr;
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
