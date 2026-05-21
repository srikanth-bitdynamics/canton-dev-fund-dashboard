'use client';

import { useState } from 'react';
import type { AppData, Period, Proposal, Milestone } from '@/lib/types';
import { fmtCC, fmtDate, statusMeta, milestoneStatusMeta, inRange } from '@/lib/utils';
import { Pill, StatCard, Chip } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ */
/*  MilestonesView                                                     */
/* ------------------------------------------------------------------ */

interface MilestoneWithProposal extends Milestone {
  proposal: Proposal;
}

interface MilestonesViewProps {
  data: AppData;
  period: Period;
  openProposal: (p: Proposal) => void;
}

export default function MilestonesView({ data, period, openProposal }: MilestonesViewProps) {
  const approved = data.proposals.filter((p) => p.status === 'approved');
  const allMsRaw: MilestoneWithProposal[] = approved.flatMap((p) =>
    p.milestones.map((m) => ({ ...m, proposal: p })),
  );
  const allMs = allMsRaw.filter((m) => inRange(m.due, period.from, period.to));
  const delivered = allMs.filter((m) => m.status === 'delivered').length;
  const atRisk = allMs.filter((m) => m.status === 'at-risk').length;

  const [statusF, setStatusF] = useState('all');
  const filteredMs = statusF === 'all' ? allMs : allMs.filter((m) => m.status === statusF);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Milestones</h1>
          <p className="page-sub">
            Anticipated vs delivered for milestones due in{' '}
            <strong style={{ color: 'var(--ink-1)' }}>{period.label}</strong>. Mirrors{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>projects/5/views/1</span>.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Anticipated" value={allMs.length} sub="Across all approved" />
        <StatCard
          label="Delivered"
          value={delivered}
          sub={`${allMs.length ? Math.round((delivered / allMs.length) * 100) : 0}% of anticipated`}
          delta="+3 this week"
          deltaTone="pos"
        />
        <StatCard
          label="In review"
          value={allMs.filter((m) => m.status === 'in-review').length}
          sub="Awaiting committee sign-off"
        />
        <StatCard
          label="At risk"
          value={atRisk}
          sub="Past due or deliverable contested"
          delta={atRisk > 0 ? `${atRisk} need attention` : 'On track'}
          deltaTone={atRisk > 0 ? 'warn' : 'pos'}
        />
      </div>

      {/* Per-project milestone heatmap */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Project &times; milestone heatmap</h3>
            <p className="card-sub">
              Each row is an approved project; cells are milestones in delivery order
            </p>
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--ms-delivered)' }} /> Delivered
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--ms-review)' }} /> In review
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--ms-progress)' }} /> In
              progress
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--ms-risk)' }} /> At risk
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--surface-3)' }} /> Planned
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {approved.map((p) => (
            <div key={p.id} className="row" style={{ gap: 12 }}>
              <div style={{ width: 300, minWidth: 300, fontSize: 12 }}>
                <div
                  style={{
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={p.title}
                >
                  {p.pr_number > 0 && (
                    <a
                      href={`https://github.com/canton-foundation/canton-dev-fund/pull/${p.pr_number}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        marginRight: 6,
                      }}
                    >
                      #{p.pr_number}
                    </a>
                  )}
                  {p.title}
                </div>
                <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>{p.applicant}</div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 24px)',
                  gap: 4,
                  flex: 1,
                }}
              >
                {p.milestones.map((m, i) => (
                  <div
                    key={i}
                    className={`ms-cell ${m.status}`}
                    title={`${m.id} · ${milestoneStatusMeta[m.status]?.label} · ${fmtCC(m.amount_cc)} CC · due ${fmtDate(m.due)}`}
                    onClick={() => openProposal(p)}
                    style={{ width: 24, height: 24 }}
                  />
                ))}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                }}
              >
                {p.milestones.filter((m) => m.status === 'delivered').length}/{p.milestones.length}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Milestone list */}
      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <div className="filterbar" style={{ margin: 0 }}>
            <Chip on={statusF === 'all'} onClick={() => setStatusF('all')}>
              All {allMs.length}
            </Chip>
            {(['delivered', 'in-review', 'in-progress', 'at-risk', 'planned'] as const).map(
              (s) => (
                <Chip key={s} on={statusF === s} onClick={() => setStatusF(s)}>
                  <span
                    className="pill-dot"
                    style={{ background: milestoneStatusMeta[s]?.dot }}
                  />
                  {milestoneStatusMeta[s]?.label}
                </Chip>
              ),
            )}
          </div>
          <div className="grow" />
        </div>
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Project</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMs.slice(0, 80).map((m) => (
                <tr key={m.id} className="row" onClick={() => openProposal(m.proposal)}>
                  <td className="mono" style={{ fontWeight: 500, color: 'var(--ink-1)' }}>
                    {m.id}
                  </td>
                  <td>
                    <div style={{ fontSize: 12.5 }}>
                      {m.proposal.pr_number > 0 && (
                        <a
                          href={`https://github.com/canton-foundation/canton-dev-fund/pull/${m.proposal.pr_number}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            marginRight: 6,
                          }}
                        >
                          #{m.proposal.pr_number}
                        </a>
                      )}
                      {m.proposal.title}
                    </div>
                    <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                      {m.proposal.applicant}
                    </div>
                  </td>
                  <td>
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
                  </td>
                  <td className="num">
                    {fmtCC(m.amount_cc)}{' '}
                    <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                      CC
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                    {fmtDate(m.due, { long: true })}
                  </td>
                  <td>
                    <button className="btn btn-ghost" style={{ fontSize: 11 }}>
                      Open &rarr;
                    </button>
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
