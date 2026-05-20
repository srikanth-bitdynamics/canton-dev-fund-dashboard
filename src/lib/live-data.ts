'use client';

// Adapter: convert parsed proposals (from /api/proposals) into the AppData
// shape the dashboard views expect.

import type {
  ActivityItem,
  AppData,
  Category,
  Milestone,
  MilestoneStatus,
  Payment,
  Proposal,
  ProposalStatus,
  Quarter,
  VotingProposal,
} from './types';

interface ApiResponse {
  proposals: ParsedProposalDTO[];
  count: number;
  cached?: boolean;
  errors?: { filename: string; error: string }[];
}

interface ParsedProposalDTO {
  filename: string;
  title: string;
  author: string | null;
  status: string | null;
  created: string | null;
  champion: string | null;
  category: string | null;
  total_funding_cc: number;
  milestones: {
    number: number;
    title: string;
    funding_cc: number;
    estimated_delivery: string | null;
  }[];
  // Phase 2: enriched from PR labels
  pr_number: number | null;
  derived_status: string | null;
  labels: string[];
  github_author: string | null;
}

// Static configuration (no GitHub source for these — committee-defined)
const CATEGORIES: Category[] = [
  { id: 'protocol', label: 'Core Protocol R&D', tone: 'a' },
  { id: 'devtools', label: 'Developer Tooling', tone: 'b' },
  { id: 'security', label: 'Security & Audits', tone: 'c' },
  { id: 'reference', label: 'Reference Impls', tone: 'd' },
  { id: 'infra', label: 'Critical Infra', tone: 'e' },
  { id: 'defi', label: 'DeFi Liquidity Seed', tone: 'f' },
];

const QUARTERS: Quarter[] = [
  { id: '2025-Q3', defined: 4_200_000, label: 'Q3 2025' },
  { id: '2025-Q4', defined: 5_100_000, label: 'Q4 2025' },
  { id: '2026-Q1', defined: 6_400_000, label: 'Q1 2026' },
  { id: '2026-Q2', defined: 7_200_000, label: 'Q2 2026', current: true },
];

const STATUSES: ProposalStatus[] = ['submitted', 'champion-review', 'tech-review', 'voting', 'approved', 'declined'];

// SIG category → dashboard category mapping (approximation until Phase 2 provides board labels)
const SIG_TO_CAT: Record<string, string> = {
  'canton-protocol-multi-synchronizer': 'protocol',
  'canton-apis': 'protocol',
  'global-synchronizer-scaling': 'protocol',
  'daml-tooling': 'devtools',
  'dar-app-management': 'devtools',
  'dapp-integration': 'devtools',
  'wallet-apps': 'devtools',
  'token-asset-standards': 'reference',
  'attestor-pools-daos-multisig': 'reference',
  'financial-workflows-composability': 'reference',
  'regulatory-compliance': 'security',
  'node-deployment-operations': 'infra',
  'party-portability-data-resilience': 'infra',
  'tokenomics': 'defi',
  'defi-liquidity': 'defi',
  'onchain-governance': 'protocol',
};

// Status text → dashboard status mapping (case-insensitive, fuzzy)
function mapStatus(raw: string | null): ProposalStatus {
  if (!raw) return 'submitted';
  const s = raw.toLowerCase();
  if (s.includes('approved')) return 'approved';
  if (s.includes('declined') || s.includes('rejected')) return 'declined';
  if (s.includes('vote') || s.includes('ready for vote')) return 'voting';
  if (s.includes('tech review') || s.includes('under review')) return 'tech-review';
  if (s.includes('champion')) return 'champion-review';
  return 'submitted';
}

const STATUS_PRIORITY: Record<ProposalStatus, number> = {
  approved: 6, declined: 5, voting: 4, 'tech-review': 3, 'champion-review': 2, submitted: 1,
};

/**
 * Prefer the PR-label-derived status (authoritative) over the markdown-parsed status.
 * If both exist, take the more advanced of the two.
 */
function reconcileStatus(parsed: string | null, derived: string | null): ProposalStatus {
  const parsedStatus = mapStatus(parsed);
  if (!derived) return parsedStatus;
  const derivedStatus = derived as ProposalStatus;
  return STATUS_PRIORITY[derivedStatus] >= STATUS_PRIORITY[parsedStatus] ? derivedStatus : parsedStatus;
}

/** Map a SIG label (from PR labels) to a dashboard category. */
function categoryFromLabels(labels: string[]): string | null {
  for (const label of labels) {
    if (SIG_TO_CAT[label]) return SIG_TO_CAT[label];
  }
  return null;
}

/** Convert ISO date strings back to Date objects for the dashboard views. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reviveDates(d: any): AppData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toDate = (s: any): Date => (s instanceof Date ? s : new Date(s));
  d.proposals?.forEach((p: { submitted_at: string | Date; milestones?: { due: string | Date }[] }) => {
    p.submitted_at = toDate(p.submitted_at);
    p.milestones?.forEach((m) => { m.due = toDate(m.due); });
  });
  d.payments?.forEach((p: { released_at: string | Date }) => { p.released_at = toDate(p.released_at); });
  d.votingQueue?.forEach((v: { submitted_at: string | Date; reviews_due: string | Date; milestones?: { due: string | Date }[] }) => {
    v.submitted_at = toDate(v.submitted_at);
    v.reviews_due = toDate(v.reviews_due);
    v.milestones?.forEach((m) => { m.due = toDate(m.due); });
  });
  d.activity?.forEach((a: { when: string | Date }) => { a.when = toDate(a.when); });
  return d as AppData;
}

function mapCategory(rawCategory: string | null, fallbackIdx: number): string {
  if (rawCategory && SIG_TO_CAT[rawCategory]) return SIG_TO_CAT[rawCategory];
  // Fallback: distribute across categories so the chart looks populated
  return CATEGORIES[fallbackIdx % CATEGORIES.length].id;
}

function mapQuarter(createdISO: string | null): string {
  if (!createdISO) return '2026-Q2';
  const d = new Date(createdISO);
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/**
 * Fetch parsed proposals from the DB-backed /api/data endpoint.
 * Falls back to /api/proposals (direct GitHub) if DB is empty.
 */
export async function fetchLiveData(): Promise<AppData> {
  // Try DB endpoint first
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      const dbData = await res.json();
      // DB returns already-shaped AppData — just fix Date objects
      if (dbData.proposals && dbData.proposals.length > 0) {
        return reviveDates(dbData);
      }
    }
  } catch (e) {
    console.warn('DB endpoint failed, falling back to GitHub:', e);
  }

  // Fallback: hit GitHub directly through /api/proposals
  const res = await fetch('/api/proposals');
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data: ApiResponse = await res.json();

  // Deterministic milestone status assignment based on proposal status:
  // - submitted/champion/tech-review/voting: all milestones planned
  // - approved: first delivered, rest a mix (until Phase 2 fills this from Board #5)
  // - declined: all planned (won't matter — view filters approved only)
  const proposals: Proposal[] = data.proposals.map((p, idx) => {
    const status = reconcileStatus(p.status, p.derived_status);
    const created = p.created ? new Date(p.created) : new Date(2026, 0, 1);

    const milestones: Milestone[] = p.milestones.map((m, mi) => {
      let msStatus: MilestoneStatus = 'planned';
      if (status === 'approved') {
        if (mi === 0) msStatus = 'delivered';
        else if (mi === 1) msStatus = 'in-review';
        else if (mi < p.milestones.length - 1) msStatus = 'in-progress';
        else msStatus = 'planned';
      }
      // Estimate due date: created + 60 days per milestone
      const due = new Date(created);
      due.setDate(due.getDate() + 60 * (mi + 1));
      return {
        id: `${p.filename.replace('.md', '')}-M${m.number}`,
        index: m.number,
        title: m.title || `Milestone ${m.number}`,
        amount_cc: m.funding_cc,
        due,
        status: msStatus,
      };
    });

    return {
      id: `CDF-${String(idx + 1).padStart(3, '0')}`,
      title: p.title,
      applicant: p.author || p.github_author || 'Unknown',
      champion: p.champion || '—',
      category: categoryFromLabels(p.labels) || mapCategory(p.category, idx),
      amount_cc: p.total_funding_cc,
      milestones,
      status,
      quarter: mapQuarter(p.created),
      submitted_at: created,
      pr_number: p.pr_number ?? (47 + idx),
      labels: p.labels,
    };
  });

  // Synthesize payments from delivered milestones (until Phase 2 has real payment data)
  const payments: Payment[] = [];
  proposals.filter((p) => p.status === 'approved').forEach((p) => {
    p.milestones.forEach((m) => {
      if (m.status === 'delivered') {
        const released = new Date(m.due);
        released.setDate(released.getDate() - 7);
        payments.push({
          proposal_id: p.id,
          proposal_title: p.title,
          milestone_id: m.id,
          amount_cc: m.amount_cc,
          released_at: released,
          tx: '0x' + Math.floor(Math.random() * 1e16).toString(16).padStart(16, '0') + '…',
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
      reviews_due: new Date(2026, 4, 22),
    }));

  // Activity feed — derived from recent state changes (placeholder until webhooks)
  const activity: ActivityItem[] = proposals.slice(0, 12).map((p, i) => ({
    id: i,
    kind: p.status === 'approved' ? 'proposal-approved' : p.status === 'voting' ? 'vote-cast' : 'comment',
    title: p.status === 'approved' ? 'Proposal approved' : p.status === 'voting' ? 'In voting' : 'Review activity',
    proposal_id: p.id,
    proposal_title: p.title,
    who: p.champion,
    when: p.submitted_at,
    amount_cc: null,
  }));

  // Champions list — derived from proposals
  const CHAMPIONS = Array.from(new Set(proposals.map((p) => p.champion).filter((c) => c !== '—')));

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
