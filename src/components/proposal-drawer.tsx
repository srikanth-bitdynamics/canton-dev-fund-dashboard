'use client';

import type { AppData, Proposal } from '@/lib/types';
import { fmtCC, fmtDate, statusMeta, milestoneStatusMeta, statusTone } from '@/lib/utils';
import { IconCC, IconCheck, IconX } from '@/components/ui/icons';
import { Pill } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ */
/*  ProposalDrawer                                                     */
/* ------------------------------------------------------------------ */

interface ProposalDrawerProps {
  proposal: Proposal | null;
  onClose: () => void;
  signedIn: boolean;
  data: AppData;
}

export default function ProposalDrawer({ proposal, onClose, signedIn, data }: ProposalDrawerProps) {
  if (!proposal) return null;

  const cat = data.CATEGORIES.find((c) => c.id === proposal.category);
  const distributed = proposal.milestones
    .filter((m) => m.status === 'delivered')
    .reduce((s, m) => s + m.amount_cc, 0);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span
                className="mono"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                }}
              >
                {proposal.id}
              </span>
              <Pill tone={statusTone(proposal.status)} dot={statusMeta[proposal.status]?.dot}>
                {statusMeta[proposal.status]?.label}
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
            <a
              href={`/proposals/${proposal.id}`}
              style={{
                fontSize: 17,
                letterSpacing: '-0.015em',
                fontWeight: 600,
                color: 'var(--ink-1)',
                textDecoration: 'none',
                display: 'block',
              }}
              title="View full proposal page"
            >
              {proposal.title} <span style={{ color: 'var(--accent)', fontSize: 13 }}>↗</span>
            </a>
            <div style={{ color: 'var(--ink-3)', fontSize: 12.5, marginTop: 4 }}>
              {proposal.applicant} &middot; Champion {proposal.champion}
              {proposal.pr_number > 0 && (
                <>
                  {' '}&middot;{' '}
                  <a
                    href={`https://github.com/canton-foundation/canton-dev-fund/pull/${proposal.pr_number}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)' }}
                  >
                    PR #{proposal.pr_number} &#8599;
                  </a>
                </>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <IconX />
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <h4>Funding</h4>
            <div className="kv-row">
              <span className="kv-k">Total ask</span>
              <span className="kv-v" style={{ fontFamily: 'var(--font-mono)' }}>
                <IconCC size={12} /> {fmtCC(proposal.amount_cc)} CC
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-k">Distributed</span>
              <span
                className="kv-v"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--good)' }}
              >
                {fmtCC(distributed)} CC (
                {proposal.amount_cc
                  ? Math.round((distributed / proposal.amount_cc) * 100)
                  : 0}
                %)
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-k">Remaining</span>
              <span className="kv-v" style={{ fontFamily: 'var(--font-mono)' }}>
                {fmtCC(proposal.amount_cc - distributed)} CC
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-k">Submitted</span>
              <span className="kv-v">{fmtDate(proposal.submitted_at, { long: true })}</span>
            </div>
            <div className="kv-row">
              <span className="kv-k">Quarter</span>
              <span className="kv-v">
                {data.QUARTERS.find((q) => q.id === proposal.quarter)?.label}
              </span>
            </div>
          </div>

          <div className="drawer-section">
            <h4>Milestones ({proposal.milestones.length})</h4>
            {proposal.milestones.map((m, i) => (
              <div key={m.id} className="ms-row">
                <div className="ms-row-num">{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ms-row-title">{m.title}</div>
                  <div className="ms-row-meta">Due {fmtDate(m.due, { long: true })}</div>
                </div>
                <Pill
                  tone={
                    m.status === 'delivered'
                      ? 'good'
                      : m.status === 'at-risk'
                        ? 'bad'
                        : m.status === 'in-review'
                          ? 'info'
                          : 'soft'
                  }
                  dot={milestoneStatusMeta[m.status]?.dot}
                >
                  {milestoneStatusMeta[m.status]?.label}
                </Pill>
                <span className="ms-row-amount">{fmtCC(m.amount_cc)}</span>
                {signedIn && m.status === 'in-review' && (
                  <button
                    className="btn btn-good"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    <IconCheck /> Approve &amp; release
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="drawer-section">
            <h4>Review notes</h4>
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 12,
                fontSize: 12.5,
                color: 'var(--ink-2)',
              }}
            >
              <strong>{proposal.champion}</strong> &middot; 3d ago
              <p style={{ margin: '6px 0 0' }}>
                Scope aligns with the synchronizer roadmap. Suggest tightening milestone 2
                acceptance criteria around throughput targets before voting.
              </p>
            </div>
          </div>
        </div>

        <div className="drawer-foot">
          {proposal.status === 'voting' && proposal.pr_number > 0 && (
            <a
              href={`https://github.com/canton-foundation/canton-dev-fund/pull/${proposal.pr_number}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              title="Voting happens via gitvote comments on the PR"
            >
              Vote on GitHub &rarr;
            </a>
          )}
          <a
            href={`/admin/proposals/${proposal.id}`}
            className="btn"
            style={{ marginLeft: 'auto' }}
          >
            Edit details &rarr;
          </a>
          {proposal.pr_number > 0 && (
            <a
              href={`https://github.com/canton-foundation/canton-dev-fund/pull/${proposal.pr_number}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              Open in GitHub &rarr;
            </a>
          )}
        </div>
      </div>
    </>
  );
}
