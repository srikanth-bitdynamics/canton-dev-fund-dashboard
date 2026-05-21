import Link from 'next/link';
import { db, schema } from '@/lib/db/client';
import { desc, eq } from 'drizzle-orm';
import { fmtCC, fmtDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const proposalCount = (await db.select().from(schema.proposals)).length;
  const approvedCount = (await db.select().from(schema.proposals).where(eq(schema.proposals.status, 'approved'))).length;
  const milestoneCount = (await db.select().from(schema.milestones)).length;
  const budgetCount = (await db.select().from(schema.budget_periods)).length;
  const lastSync = (await db.select().from(schema.sync_log).orderBy(desc(schema.sync_log.started_at)).limit(1))[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Admin overview</h1>
          <p className="page-sub">Manage budgets, sync data from GitHub, and assign committee roles.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Proposals in DB</div>
          <div className="stat-value">{proposalCount}</div>
          <div className="stat-sub">{approvedCount} approved · {milestoneCount} milestones</div>
        </div>
        <div className="stat">
          <div className="stat-label">Budget periods</div>
          <div className="stat-value">{budgetCount}</div>
          <div className="stat-sub">
            <Link href="/admin/budget" style={{ color: 'var(--accent)' }}>Manage →</Link>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Last sync</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            {lastSync ? fmtDate(new Date(lastSync.started_at), { long: true }) : 'Never'}
          </div>
          <div className="stat-sub">{lastSync?.status} · {lastSync?.items_processed ?? 0} items</div>
        </div>
        <div className="stat">
          <div className="stat-label">Quick actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <Link href="/admin/sync" className="btn">Run sync now</Link>
            <Link href="/admin/budget" className="btn btn-ghost">Add budget period</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Welcome to the admin console</h3>
            <p className="card-sub">All write operations are gated by your role (committee_member or admin).</p>
          </div>
        </div>
        <ul style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.8, paddingLeft: 18 }}>
          <li><strong>Budget periods</strong> — Define quarterly Canton Coin allocations. These power the budget envelope KPI on the Overview.</li>
          <li><strong>Sync</strong> — Pull fresh proposal data from GitHub. Runs automatically every hour (Vercel cron) but can be triggered manually here.</li>
          <li><strong>Users</strong> — Override per-user roles. By default roles come from canton-foundation org membership.</li>
        </ul>
      </div>
    </>
  );
}
