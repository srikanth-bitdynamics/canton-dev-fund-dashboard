'use client';

// Mock dataset modeled on the Canton Foundation Protocol Development Fund.
// Replace with real data ingested from canton-foundation/canton-dev-fund.

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

let _cache: AppData | null = null;

export function getData(): AppData {
  if (_cache) return _cache;
  _cache = buildData();
  return _cache;
}

function buildData(): AppData {
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

  const CHAMPIONS = [
    'M. Langyintuo', 'A. Petrov', 'S. Okafor', 'R. Chen',
    'J. Hartmann', 'L. Costa', 'D. Yilmaz', 'K. Nakamura',
  ];

  const APPLICANTS = [
    'Splice Labs', 'Obsidian Systems', 'Forge Cryptography', 'Hydra Research',
    'Liquify', 'NorthBlock', 'Daml Hub Collective', 'Verdant Audit Group',
    'Helix Validators', 'Riverbed Tooling', 'Atlas Indexer', 'OpenCanton Devs',
    'Quorum Bridge', 'Sentinel Sec', 'Tessellate', 'Pillar Infra',
    'Beacon Reference', 'Tide Liquidity', 'Mercury DeFi', 'KeelBlock',
    'Civic Daml', 'Pebble Tools', 'Argus Audits', 'Bramble',
  ];

  const TITLES = [
    'Light-client verification spec for SV ledger',
    'Daml LSP performance overhaul',
    'Formal verification harness for ABA consensus',
    'Open-source block explorer v2',
    'Canton Coin payment SDK (TypeScript)',
    'External audit: synchronizer upgrade path',
    'Reference DEX implementation',
    'Validator monitoring dashboards',
    'JSON-RPC compatibility layer',
    'Subgraph-style indexer for Canton',
    'WASM smart contract runtime PoC',
    'Privacy-preserving analytics primitives',
    'Documentation portal redesign',
    'Penetration test: featured-app boundaries',
    'Reference RWA tokenization template',
    'CC liquidity seeding — Pillar AMM',
    'Daml compiler regression suite',
    'Time-locked custody reference impl',
    'Cross-domain transfer benchmark suite',
    'Validator slashing policy formalization',
    'Light-mode mobile wallet reference',
    'Devnet provisioning CLI',
    'Audit: cross-chain messaging adapter',
    'Reference NFT marketplace template',
  ];

  const STATUSES: ProposalStatus[] = ['submitted', 'champion-review', 'tech-review', 'voting', 'approved', 'declined'];

  // Deterministic pseudo-random for stable rendering
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  // Generate proposals
  const proposals: Proposal[] = TITLES.map((title, i) => {
    const milestoneCount = 2 + Math.floor(rnd() * 4);
    const baseAmount = 80_000 + Math.floor(rnd() * 920_000);
    const milestones: Milestone[] = range(milestoneCount).map((mi) => ({
      id: `M${i + 1}.${mi + 1}`,
      index: mi + 1,
      title: `Milestone ${mi + 1}`,
      amount_cc: Math.round((baseAmount / milestoneCount) * (0.7 + rnd() * 0.6)),
      due: addDays(new Date(2026, 0, 15), Math.floor(rnd() * 240)),
      status: 'planned' as MilestoneStatus,
    }));

    let status: ProposalStatus;
    const r = rnd();
    if (i < 11) status = 'approved';
    else if (r < 0.15) status = 'declined';
    else if (r < 0.4) status = 'voting';
    else if (r < 0.65) status = 'tech-review';
    else if (r < 0.85) status = 'champion-review';
    else status = 'submitted';

    const quarter = pick(QUARTERS).id;

    return {
      id: `PR-${(i + 47).toString().padStart(3, '0')}`,
      title,
      applicant: APPLICANTS[i % APPLICANTS.length],
      champion: pick(CHAMPIONS),
      category: pick(CATEGORIES).id,
      amount_cc: milestones.reduce((s, m) => s + m.amount_cc, 0),
      milestones,
      status,
      quarter,
      submitted_at: addDays(new Date(2025, 7, 1), Math.floor(rnd() * 290)),
      pr_number: 47 + i,
      labels: [],
    };
  });

  // Evolve milestone statuses for approved proposals
  proposals.filter((p) => p.status === 'approved').forEach((p) => {
    p.milestones.forEach((m, mi) => {
      const r = rnd();
      if (mi === 0) m.status = 'delivered';
      else if (r < 0.55) m.status = 'delivered';
      else if (r < 0.75) m.status = 'in-review';
      else if (r < 0.9) m.status = 'in-progress';
      else m.status = 'at-risk';
    });
  });

  // Payment ledger
  const payments: Payment[] = [];
  proposals.filter((p) => p.status === 'approved').forEach((p) => {
    p.milestones.forEach((m) => {
      if (m.status === 'delivered') {
        payments.push({
          proposal_id: p.id,
          proposal_title: p.title,
          milestone_id: m.id,
          amount_cc: m.amount_cc,
          released_at: addDays(m.due, -Math.floor(rnd() * 14)),
          tx: '0x' + Math.floor(rnd() * 1e16).toString(16).padStart(16, '0') + '…',
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
      committee_votes: {
        approve: Math.floor(rnd() * 5),
        decline: Math.floor(rnd() * 2),
        abstain: Math.floor(rnd() * 2),
      },
      reviews_due: addDays(new Date(2026, 4, 22), Math.floor(rnd() * 4)),
    }));

  // Activity feed
  const activityKinds = [
    { k: 'milestone-delivered', t: 'Milestone delivered' },
    { k: 'payment-released', t: 'Payment released' },
    { k: 'proposal-approved', t: 'Proposal approved' },
    { k: 'proposal-declined', t: 'Proposal declined' },
    { k: 'vote-cast', t: 'Committee vote cast' },
    { k: 'comment', t: 'Review comment' },
  ];
  const activity: ActivityItem[] = range(18).map((i) => {
    const kind = pick(activityKinds);
    const prop = proposals[Math.floor(rnd() * proposals.length)];
    return {
      id: i,
      kind: kind.k,
      title: kind.t,
      proposal_id: prop.id,
      proposal_title: prop.title,
      who: pick(CHAMPIONS),
      when: addDays(new Date(2026, 4, 20), -Math.floor(rnd() * 21)),
      amount_cc: kind.k === 'payment-released' ? Math.floor(rnd() * 200_000) : null,
    };
  }).sort((a, b) => b.when.getTime() - a.when.getTime());

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
