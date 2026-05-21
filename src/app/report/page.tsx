// Executive report — built for committee meetings and public sharing.
// Print → Save as PDF for distribution.
//
// Period is set via ?from=YYYY-MM-DD&to=YYYY-MM-DD; defaults to all-time.

import { queryAppData, getLatestSyncLog } from '@/lib/db/queries';
import { fmtCC, fmtDate, inRange, budgetForRange } from '@/lib/utils';
import { normalizeCompany } from '@/lib/applicant';
import PrintButton from './print-button';
import './report.css';

export const dynamic = 'force-dynamic';

interface SearchParams { from?: string; to?: string; label?: string }

export default async function ReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const from = sp.from ? new Date(sp.from) : new Date('2025-01-01');
  const to = sp.to ? new Date(sp.to) : new Date('2099-12-31');
  const label = sp.label || (sp.from && sp.to ? `${sp.from} → ${sp.to}` : 'All time');

  const data = await queryAppData();
  const lastSync = await getLatestSyncLog();

  // Slicing ----------------------------------------------------------
  const approved = data.proposals.filter((p) => p.status === 'approved');
  const approvedInP = approved.filter((p) => inRange(p.submitted_at, from, to));
  const voting = data.proposals.filter((p) => p.status === 'voting');
  const declined = data.proposals.filter((p) => p.status === 'declined');
  const inPipeline = data.proposals.filter((p) =>
    ['submitted', 'champion-review', 'tech-review'].includes(p.status),
  );

  const defined = budgetForRange(data.QUARTERS, from, to);
  const committed = approvedInP.reduce((s, p) => s + p.amount_cc, 0);
  const payments = data.payments.filter((pm) => inRange(pm.released_at, from, to));
  const distributed = payments.reduce((s, pm) => s + pm.amount_cc, 0);
  const headroom = defined - committed;
  const pendingAsk = inPipeline.reduce((s, p) => s + p.amount_cc, 0);

  // Milestones across approved
  const allMs = approved.flatMap((p) => p.milestones);
  const msByStatus = {
    delivered: allMs.filter((m) => m.status === 'delivered').length,
    paying: allMs.filter((m) => m.status === 'paying').length,
    approved: allMs.filter((m) => m.status === 'approved').length,
    inReview: allMs.filter((m) => m.status === 'in-review').length,
    inProgress: allMs.filter((m) => m.status === 'in-progress').length,
    planned: allMs.filter((m) => m.status === 'planned').length,
    atRisk: allMs.filter((m) => m.status === 'at-risk').length,
  };
  const totalMs = allMs.length;
  const deliveryRate = totalMs ? Math.round((msByStatus.delivered / totalMs) * 100) : 0;

  // Top recipients by company
  const byCompany = new Map<string, { committed: number; distributed: number; projects: number }>();
  for (const p of approvedInP) {
    const co = normalizeCompany(p.applicant);
    const entry = byCompany.get(co) || { committed: 0, distributed: 0, projects: 0 };
    entry.committed += p.amount_cc;
    entry.distributed += p.milestones
      .filter((m) => m.status === 'delivered')
      .reduce((s, m) => s + m.amount_cc, 0);
    entry.projects += 1;
    byCompany.set(co, entry);
  }
  const topRecipients = Array.from(byCompany.entries())
    .map(([co, v]) => ({ co, ...v }))
    .sort((a, b) => b.committed - a.committed)
    .slice(0, 10);

  // Category breakdown
  const byCategory = data.CATEGORIES.map((c) => {
    const props = approvedInP.filter((p) => p.category === c.id);
    return {
      ...c,
      n: props.length,
      committed: props.reduce((s, p) => s + p.amount_cc, 0),
    };
  }).sort((a, b) => b.committed - a.committed);

  // Upcoming milestones (next 60 days)
  const todayMs = Date.now();
  const upcoming = approved
    .flatMap((p) =>
      p.milestones
        .filter((m) => m.status !== 'delivered')
        .map((m) => ({
          proposal: p,
          milestone: m,
          daysOut: Math.round((new Date(m.due).getTime() - todayMs) / 86400000),
        })),
    )
    .filter((x) => x.daysOut >= 0 && x.daysOut <= 60)
    .sort((a, b) => a.daysOut - b.daysOut)
    .slice(0, 10);

  const generatedAt = new Date();

  return (
    <div className="report">
      {/* Print/back controls (hidden in print output) */}
      <div className="report-controls no-print">
        <a href="/" className="rep-link">← Back to dashboard</a>
        <PrintButton />
      </div>

      <header className="rep-header">
        <div className="rep-brand">
          <div className="rep-brand-mark">CDF</div>
          <div>
            <div className="rep-brand-name">Canton Development Fund</div>
            <div className="rep-brand-sub">Committee report</div>
          </div>
        </div>
        <div className="rep-meta">
          <div><strong>Period:</strong> {label}</div>
          <div><strong>Generated:</strong> {fmtDate(generatedAt, { long: true })}</div>
          {lastSync && (
            <div className="muted">
              Data synced {fmtDate(new Date(lastSync.started_at), { long: true })} · {lastSync.status}
            </div>
          )}
        </div>
      </header>

      {/* Executive summary */}
      <section className="rep-section">
        <h2>Executive summary</h2>
        <p className="rep-lead">
          The Canton Development Fund has committed <strong>{fmtCC(committed)} CC</strong> across{' '}
          <strong>{approvedInP.length}</strong> approved {approvedInP.length === 1 ? 'project' : 'projects'}{' '}
          in this period, against a defined envelope of <strong>{fmtCC(defined)} CC</strong>{' '}
          ({defined > 0 ? Math.round((committed / defined) * 100) : 0}% committed). To date,{' '}
          <strong>{fmtCC(distributed)} CC</strong> has been disbursed to grantees across{' '}
          <strong>{msByStatus.delivered}</strong> delivered{' '}
          {msByStatus.delivered === 1 ? 'milestone' : 'milestones'}{' '}
          ({deliveryRate}% of {totalMs} planned). <strong>{voting.length}</strong>{' '}
          {voting.length === 1 ? 'proposal is' : 'proposals are'} currently open for committee
          vote, with <strong>{inPipeline.length}</strong> additional{' '}
          {inPipeline.length === 1 ? 'proposal' : 'proposals'} in earlier review stages.
        </p>
      </section>

      {/* Headline KPIs */}
      <section className="rep-section">
        <div className="kpi-grid">
          <Kpi label="Budget envelope" value={fmtCC(defined)} unit="CC" sub={label} />
          <Kpi label="Committed" value={fmtCC(committed)} unit="CC"
               sub={`${defined ? Math.round((committed / defined) * 100) : 0}% of envelope`} />
          <Kpi label="Distributed" value={fmtCC(distributed)} unit="CC"
               sub={`${committed ? Math.round((distributed / committed) * 100) : 0}% of committed`} />
          <Kpi label="Headroom" value={fmtCC(Math.max(0, headroom))} unit="CC"
               sub={pendingAsk > 0 ? `Pending asks ${fmtCC(pendingAsk)}` : 'No pending asks'} />
        </div>
      </section>

      {/* Pipeline + milestones */}
      <section className="rep-section">
        <h2>Pipeline &amp; delivery</h2>
        <div className="two-col">
          <div>
            <h3>Proposal pipeline</h3>
            <table className="rep-table">
              <tbody>
                <Row label="In intake / review" value={inPipeline.length} />
                <Row label="Open for vote" value={voting.length} />
                <Row label="Approved (all time)" value={approved.length} />
                <Row label="Declined (all time)" value={declined.length} />
              </tbody>
            </table>
          </div>
          <div>
            <h3>Milestone status</h3>
            <table className="rep-table">
              <tbody>
                <Row label="Payment Disbursed" value={msByStatus.delivered} hint={`${deliveryRate}%`} />
                <Row label="Payment Ready to Disburse" value={msByStatus.paying} />
                <Row label="Ready for Payment" value={msByStatus.approved} />
                <Row label="In Review for Payment" value={msByStatus.inReview} />
                <Row label="In Progress" value={msByStatus.inProgress} />
                <Row label="Planned" value={msByStatus.planned} />
                {msByStatus.atRisk > 0 && <Row label="At risk" value={msByStatus.atRisk} hint="needs attention" />}
                <Row label="Total milestones" value={totalMs} bold />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Category breakdown */}
      <section className="rep-section">
        <h2>Funding by category</h2>
        <table className="rep-table wide">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Projects</th>
              <th className="num">Committed (CC)</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td className="num">{c.n}</td>
                <td className="num">{fmtCC(c.committed)}</td>
                <td className="num">{committed > 0 ? Math.round((c.committed / committed) * 100) : 0}%</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>Total</td>
              <td className="num">{approvedInP.length}</td>
              <td className="num">{fmtCC(committed)}</td>
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Top recipients */}
      <section className="rep-section">
        <h2>Top recipients</h2>
        <table className="rep-table wide">
          <thead>
            <tr>
              <th>#</th>
              <th>Recipient</th>
              <th className="num">Projects</th>
              <th className="num">Committed (CC)</th>
              <th className="num">Distributed (CC)</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {topRecipients.map((r, i) => (
              <tr key={r.co}>
                <td className="num muted">{i + 1}</td>
                <td>{r.co}</td>
                <td className="num">{r.projects}</td>
                <td className="num">{fmtCC(r.committed)}</td>
                <td className="num">{fmtCC(r.distributed)}</td>
                <td className="num">{committed > 0 ? Math.round((r.committed / committed) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Approved projects roster */}
      <section className="rep-section">
        <h2>Approved projects roster</h2>
        <table className="rep-table wide">
          <thead>
            <tr>
              <th>ID</th>
              <th>PR</th>
              <th>Project</th>
              <th>Recipient</th>
              <th className="num">Committed (CC)</th>
              <th className="num">Milestones</th>
            </tr>
          </thead>
          <tbody>
            {approvedInP
              .sort((a, b) => b.amount_cc - a.amount_cc)
              .map((p) => {
                const delivered = p.milestones.filter((m) => m.status === 'delivered').length;
                return (
                  <tr key={p.id}>
                    <td className="mono">{p.id}</td>
                    <td className="mono">
                      {p.pr_number > 0 ? (
                        <a href={`https://github.com/canton-foundation/canton-dev-fund/pull/${p.pr_number}`}>
                          #{p.pr_number}
                        </a>
                      ) : '—'}
                    </td>
                    <td>{p.title}</td>
                    <td>{normalizeCompany(p.applicant)}</td>
                    <td className="num">{fmtCC(p.amount_cc)}</td>
                    <td className="num">{delivered}/{p.milestones.length}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>

      {/* Upcoming milestones */}
      {upcoming.length > 0 && (
        <section className="rep-section">
          <h2>Upcoming milestone deliveries (next 60 days)</h2>
          <table className="rep-table wide">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Project</th>
                <th>Recipient</th>
                <th className="num">Amount (CC)</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((u) => (
                <tr key={u.milestone.id}>
                  <td className="mono">{u.milestone.id}</td>
                  <td>{u.proposal.title}</td>
                  <td>{normalizeCompany(u.proposal.applicant)}</td>
                  <td className="num">{fmtCC(u.milestone.amount_cc)}</td>
                  <td>{fmtDate(u.milestone.due)} ({u.daysOut === 0 ? 'today' : `in ${u.daysOut}d`})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Open votes this week */}
      {voting.length > 0 && (
        <section className="rep-section">
          <h2>Open for vote</h2>
          <table className="rep-table wide">
            <thead>
              <tr>
                <th>PR</th>
                <th>Project</th>
                <th>Applicant</th>
                <th>Champion</th>
                <th className="num">Ask (CC)</th>
              </tr>
            </thead>
            <tbody>
              {voting.map((p) => (
                <tr key={p.id}>
                  <td className="mono">
                    {p.pr_number > 0 ? (
                      <a href={`https://github.com/canton-foundation/canton-dev-fund/pull/${p.pr_number}`}>
                        #{p.pr_number}
                      </a>
                    ) : '—'}
                  </td>
                  <td>{p.title}</td>
                  <td>{p.applicant}</td>
                  <td>{p.champion || '—'}</td>
                  <td className="num">{fmtCC(p.amount_cc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="rep-footer">
        <div>
          Source data: GitHub Project Boards #3 (pipeline) &amp; #5 (milestones), and the canonical
          YAML ledger in Issue #1 of the dashboard repository.
        </div>
        <div className="muted">
          Generated by the Canton Dev Fund dashboard · Print → Save as PDF for distribution.
        </div>
      </footer>
    </div>
  );
}

function Kpi({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}{unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function Row({ label, value, hint, bold }: { label: string; value: number; hint?: string; bold?: boolean }) {
  return (
    <tr className={bold ? 'total-row' : ''}>
      <td>{label}</td>
      <td className="num">{value}{hint && <span className="muted"> · {hint}</span>}</td>
    </tr>
  );
}
