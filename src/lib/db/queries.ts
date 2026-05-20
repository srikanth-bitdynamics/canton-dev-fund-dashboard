import { db, schema } from './client';
import { desc, eq } from 'drizzle-orm';
import type { AppData, Proposal, Milestone, MilestoneStatus, ProposalStatus, Payment, VotingProposal, ActivityItem, Category, Quarter } from '@/lib/types';

const CATEGORIES: Category[] = [
  { id: 'protocol', label: 'Core Protocol R&D', tone: 'a' },
  { id: 'devtools', label: 'Developer Tooling', tone: 'b' },
  { id: 'security', label: 'Security & Audits', tone: 'c' },
  { id: 'reference', label: 'Reference Impls', tone: 'd' },
  { id: 'infra', label: 'Critical Infra', tone: 'e' },
  { id: 'defi', label: 'DeFi Liquidity Seed', tone: 'f' },
];

const STATUSES: ProposalStatus[] = ['submitted', 'champion-review', 'tech-review', 'voting', 'approved', 'declined'];

/** Load all proposals + milestones from DB and shape into AppData for the dashboard views. */
export function queryAppData(): AppData {
  const proposalRows = db.select().from(schema.proposals).all();
  const milestoneRows = db.select().from(schema.milestones).all();
  const budgetRows = db.select().from(schema.budget_periods).all();

  const milestonesByProposal = new Map<string, Milestone[]>();
  for (const m of milestoneRows) {
    const list = milestonesByProposal.get(m.proposal_id) || [];
    // Estimate due date from delivery text + created date — fallback to +60 days per milestone
    const created = proposalRows.find((p) => p.id === m.proposal_id)?.created_date;
    const baseDate = created ? new Date(created) : new Date();
    const due = new Date(baseDate);
    due.setDate(due.getDate() + 60 * m.milestone_number);
    list.push({
      id: m.id,
      index: m.milestone_number,
      title: m.title || `Milestone ${m.milestone_number}`,
      amount_cc: m.funding_cc,
      due,
      status: m.status as MilestoneStatus,
    });
    milestonesByProposal.set(m.proposal_id, list);
  }
  for (const list of milestonesByProposal.values()) list.sort((a, b) => a.index - b.index);

  const proposals: Proposal[] = proposalRows.map((p) => {
    const ms = milestonesByProposal.get(p.id) || [];
    // For approved proposals with milestones, evolve status: first delivered, rest planned
    if (p.status === 'approved' && ms.length > 0) {
      ms[0].status = 'delivered';
      for (let i = 1; i < ms.length; i++) {
        if (i === 1 && ms.length > 2) ms[i].status = 'in-review';
        else if (i < ms.length - 1) ms[i].status = 'in-progress';
      }
    }
    return {
      id: p.id,
      title: p.title,
      applicant: p.author || p.github_author || 'Unknown',
      champion: p.champion || '—',
      category: p.category || 'protocol',
      amount_cc: p.total_funding_cc,
      milestones: ms,
      status: p.status as ProposalStatus,
      quarter: p.quarter || '2026-Q2',
      submitted_at: p.created_date ? new Date(p.created_date) : new Date(),
      pr_number: p.github_pr_number || 0,
      labels: p.labels ? JSON.parse(p.labels) : [],
    };
  });

  // Payments — prefer real DB rows (from /admin release-payment); fall back to synthesizing
  // from delivered milestones for proposals that haven't had a real payment recorded yet.
  const paymentRows = db.select().from(schema.payments).all();
  const milestonesWithRealPayment = new Set(paymentRows.map((p) => p.milestone_id));
  const proposalById = new Map(proposals.map((p) => [p.id, p]));
  const milestoneById = new Map(milestoneRows.map((m) => [m.id, m]));

  const payments: Payment[] = [];
  // Real payments first
  for (const pr of paymentRows) {
    const m = milestoneById.get(pr.milestone_id);
    const p = m ? proposalById.get(m.proposal_id) : null;
    payments.push({
      proposal_id: p?.id || '—',
      proposal_title: p?.title || '—',
      milestone_id: pr.milestone_id,
      amount_cc: pr.amount_cc,
      released_at: pr.released_date ? new Date(pr.released_date) : new Date(),
      tx: pr.transaction_hash || '—',
      applicant: p?.applicant || '—',
    });
  }
  // Synthesized payments for delivered milestones without a real payment row
  proposals.filter((p) => p.status === 'approved').forEach((p) => {
    p.milestones.forEach((m) => {
      if (m.status === 'delivered' && !milestonesWithRealPayment.has(m.id)) {
        const released = new Date(m.due);
        released.setDate(released.getDate() - 7);
        payments.push({
          proposal_id: p.id,
          proposal_title: p.title,
          milestone_id: m.id,
          amount_cc: m.amount_cc,
          released_at: released,
          tx: '(synthetic — no tx recorded)',
          applicant: p.applicant,
        });
      }
    });
  });
  payments.sort((a, b) => b.released_at.getTime() - a.released_at.getTime());

  // Voting queue
  const votingQueue: VotingProposal[] = proposals
    .filter((p) => p.status === 'voting')
    .slice(0, 6)
    .map((p) => ({
      ...p,
      committee_votes: { approve: 0, decline: 0, abstain: 0 },
      reviews_due: new Date(),
    }));

  // Activity from recent sync_log + status changes (placeholder)
  const recentSyncs = db.select().from(schema.sync_log).orderBy(desc(schema.sync_log.started_at)).limit(5).all();
  const activity: ActivityItem[] = recentSyncs.map((s, i) => ({
    id: i,
    kind: 'comment',
    title: `Sync ${s.status}`,
    proposal_id: '—',
    proposal_title: `${s.items_processed} items via ${s.source}`,
    who: 'sync',
    when: new Date(s.started_at),
    amount_cc: null,
  }));

  const CHAMPIONS = Array.from(new Set(proposals.map((p) => p.champion).filter((c) => c !== '—')));

  // Quarters — prefer DB budget_periods, fall back to defaults
  const QUARTERS: Quarter[] = budgetRows.length > 0
    ? budgetRows.map((b) => ({
        id: b.period_name.replace(/^Q(\d)\s+(\d+)$/, '$2-Q$1'),
        defined: b.total_budget_cc,
        label: b.period_name,
        current: !!b.is_current,
      }))
    : [
        { id: '2025-Q3', defined: 4_200_000, label: 'Q3 2025' },
        { id: '2025-Q4', defined: 5_100_000, label: 'Q4 2025' },
        { id: '2026-Q1', defined: 6_400_000, label: 'Q1 2026' },
        { id: '2026-Q2', defined: 7_200_000, label: 'Q2 2026', current: true },
      ];

  return {
    CATEGORIES,
    QUARTERS,
    STATUSES,
    CHAMPIONS,
    proposals,
    payments,
    votingQueue,
    activity,
  };
}

export function getLatestSyncLog() {
  return db.select().from(schema.sync_log).orderBy(desc(schema.sync_log.started_at)).limit(1).get();
}

export function getProposalCount() {
  const result = db.select({ count: schema.proposals.id }).from(schema.proposals).all();
  return result.length;
}
