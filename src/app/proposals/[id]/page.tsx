import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, schema } from '@/lib/db/client';
import { eq, inArray } from 'drizzle-orm';
import { fmtCC, fmtDate, statusMeta, milestoneStatusMeta, statusTone, categoryMeta } from '@/lib/utils';
import type { ProposalStatus, MilestoneStatus } from '@/lib/types';
import { auth } from '@/lib/auth/config';
import { hasRole } from '@/lib/auth/role-types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const p = db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).get();
  return { title: p ? `${p.title} · Canton Dev Fund` : 'Proposal not found' };
}

export default async function ProposalPublicPage({ params }: PageProps) {
  const { id } = await params;
  const proposal = db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).get();
  if (!proposal) notFound();

  const milestones = db
    .select()
    .from(schema.milestones)
    .where(eq(schema.milestones.proposal_id, id))
    .all()
    .sort((a, b) => a.milestone_number - b.milestone_number);

  const milestoneIds = milestones.map((m) => m.id);
  const payments = milestoneIds.length
    ? db.select().from(schema.payments).where(inArray(schema.payments.milestone_id, milestoneIds)).all()
    : [];
  const paymentByMilestone = new Map(payments.map((p) => [p.milestone_id, p]));

  const session = await auth();
  const canEdit = hasRole(session?.user?.role, 'committee_member');

  const cat = proposal.category ? categoryMeta(proposal.category) : { label: '—', ink: 'var(--ink-3)' };
  const overrides: string[] = proposal.overrides ? JSON.parse(proposal.overrides) : [];
  const labels: string[] = proposal.labels ? JSON.parse(proposal.labels) : [];

  const distributed = payments.reduce((s, p) => s + p.amount_cc, 0);
  const remaining = proposal.total_funding_cc - distributed;
  const deliveredCount = milestones.filter((m) => m.status === 'delivered').length;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 80px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
        <Link href="/" style={{ color: 'var(--ink-3)' }}>← Dashboard</Link>
        {' · '}
        <span className="mono">{proposal.id}</span>
        {proposal.github_pr_number && (
          <>
            {' · '}
            <a
              href={`https://github.com/canton-foundation/canton-dev-fund/pull/${proposal.github_pr_number}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              PR #{proposal.github_pr_number} ↗
            </a>
          </>
        )}
      </div>

      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span className={`pill pill-${statusTone(proposal.status as ProposalStatus)}`}>
            <span className="pill-dot" style={{ background: statusMeta[proposal.status as ProposalStatus]?.dot }} />
            {statusMeta[proposal.status as ProposalStatus]?.label || proposal.status}
          </span>
          {proposal.category && (
            <span className="tag">
              <span className="tag-dot" style={{ background: cat.ink }} />
              {cat.label}
            </span>
          )}
          {proposal.quarter && <span className="tag">{proposal.quarter}</span>}
          {!proposal.in_repo && <span className="tag" style={{ color: 'var(--warn)' }}>PR-only</span>}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
          {proposal.title}
        </h1>
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>
          {proposal.author || '—'}
          {proposal.champion && (
            <> · Champion <span style={{ color: 'var(--ink-1)' }}>{proposal.champion}</span></>
          )}
        </div>

        {canEdit && (
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <Link href={`/admin/proposals/${id}`} className="btn btn-primary">
              Edit details →
            </Link>
            {overrides.length > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)', alignSelf: 'center' }}>
                {overrides.length} field{overrides.length === 1 ? '' : 's'} admin-overridden:
                {' '}
                <span style={{ color: 'var(--accent)' }}>{overrides.join(', ')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Funding summary */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="stat-label">Total ask</div>
          <div className="stat-value">{fmtCC(proposal.total_funding_cc)}</div>
          <div className="stat-sub">Canton Coin</div>
        </div>
        <div className="stat">
          <div className="stat-label">Distributed</div>
          <div className="stat-value">{fmtCC(distributed)}</div>
          <div className="stat-sub">{payments.length} payment{payments.length === 1 ? '' : 's'} released</div>
        </div>
        <div className="stat">
          <div className="stat-label">Remaining</div>
          <div className="stat-value">{fmtCC(Math.max(0, remaining))}</div>
          <div className="stat-sub">
            {proposal.total_funding_cc > 0
              ? `${Math.round((distributed / proposal.total_funding_cc) * 100)}% paid`
              : 'No funding set'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Milestones</div>
          <div className="stat-value">{deliveredCount}/{milestones.length}</div>
          <div className="stat-sub">delivered</div>
        </div>
      </div>

      {/* Milestones */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Milestones</h3>
            <p className="card-sub">{milestones.length} milestone{milestones.length === 1 ? '' : 's'}{proposal.milestones_locked ? ' · locked by admin' : ''}</p>
          </div>
        </div>
        {milestones.length === 0 ? (
          <div className="empty">No milestones recorded for this proposal.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {milestones.map((m) => {
              const payment = paymentByMilestone.get(m.id);
              const ms = m.status as MilestoneStatus;
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr auto auto',
                    gap: 14,
                    alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: 'var(--surface-2)', border: '1px solid var(--line)',
                    display: 'grid', placeItems: 'center', fontSize: 12,
                    color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
                  }}>{m.milestone_number}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.title || `Milestone ${m.milestone_number}`}</div>
                    {m.estimated_delivery && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                        Delivery: {m.estimated_delivery}
                      </div>
                    )}
                    {payment && (
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>Released {payment.released_date ? fmtDate(new Date(payment.released_date), { long: true }) : '—'}</span>
                        {payment.transaction_hash && <span className="mono">tx {payment.transaction_hash.slice(0, 14)}…</span>}
                        {payment.evidence_url && (
                          <a href={payment.evidence_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                            Evidence ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`pill pill-${ms === 'delivered' ? 'good' : ms === 'at-risk' ? 'bad' : ms === 'in-review' ? 'info' : 'soft'}`}>
                    <span className="pill-dot" style={{ background: milestoneStatusMeta[ms]?.dot }} />
                    {milestoneStatusMeta[ms]?.label || m.status}
                  </span>
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{fmtCC(m.funding_cc)}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>CC</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">Payment history</h3>
              <p className="card-sub">{payments.length} on-chain disbursement{payments.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Milestone</th>
                <th>Tx hash</th>
                <th>Evidence</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.sort((a, b) => (b.released_date || '').localeCompare(a.released_date || '')).map((p) => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12 }}>{p.released_date ? fmtDate(new Date(p.released_date), { long: true }) : '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.milestone_id}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {p.transaction_hash ? p.transaction_hash.slice(0, 18) + '…' : '—'}
                  </td>
                  <td>
                    {p.evidence_url ? (
                      <a href={p.evidence_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 12 }}>
                        link ↗
                      </a>
                    ) : (
                      <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td className="num">{fmtCC(p.amount_cc)} <span style={{ color: 'var(--ink-4)' }}>CC</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Metadata footer */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Details</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 24px', fontSize: 12.5 }}>
          <span style={{ color: 'var(--ink-3)' }}>Submitted</span>
          <span>{proposal.created_date ? fmtDate(new Date(proposal.created_date), { long: true }) : '—'}</span>
          {proposal.updated_date && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>Last updated</span>
              <span>{fmtDate(new Date(proposal.updated_date), { long: true })}</span>
            </>
          )}
          {proposal.author_email && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>Contact</span>
              <a href={`mailto:${proposal.author_email}`} style={{ color: 'var(--accent)' }}>{proposal.author_email}</a>
            </>
          )}
          {proposal.website && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>Website</span>
              <a href={proposal.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{proposal.website}</a>
            </>
          )}
          {proposal.twitter && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>X / Twitter</span>
              <a href={proposal.twitter} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{proposal.twitter}</a>
            </>
          )}
          {labels.length > 0 && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>GitHub labels</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {labels.map((l) => <span key={l} className="tag">{l}</span>)}
              </span>
            </>
          )}
          <span style={{ color: 'var(--ink-3)' }}>Filename</span>
          <span className="mono" style={{ fontSize: 11 }}>{proposal.filename}</span>
        </div>
      </div>
    </div>
  );
}
