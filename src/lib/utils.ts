import type { MilestoneStatus, Period, ProposalStatus, Quarter } from './types';

export function fmtCC(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n).toLocaleString();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d: Date | string, opts: { long?: boolean } = {}): string {
  const date = d instanceof Date ? d : new Date(d);
  const m = MONTHS[date.getMonth()];
  if (opts.long) return `${m} ${date.getDate()}, ${date.getFullYear()}`;
  return `${m} ${date.getDate()}`;
}

export function relTime(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export const statusMeta: Record<ProposalStatus, { label: string; dot: string }> = {
  submitted: { label: 'Submitted', dot: 'var(--s-submitted)' },
  'champion-review': { label: 'Champion review', dot: 'var(--s-champion)' },
  'tech-review': { label: 'Tech review', dot: 'var(--s-tech)' },
  voting: { label: 'Voting', dot: 'var(--s-voting)' },
  approved: { label: 'Approved', dot: 'var(--s-approved)' },
  declined: { label: 'Declined', dot: 'var(--s-declined)' },
};

export const milestoneStatusMeta: Record<MilestoneStatus, { label: string; dot: string }> = {
  planned: { label: 'Planned', dot: 'var(--ms-planned)' },
  'in-progress': { label: 'In progress', dot: 'var(--ms-progress)' },
  'in-review': { label: 'In review', dot: 'var(--ms-review)' },
  delivered: { label: 'Delivered', dot: 'var(--ms-delivered)' },
  'at-risk': { label: 'At risk', dot: 'var(--ms-risk)' },
};

export function categoryMeta(id: string): { label: string; ink: string } {
  const map: Record<string, { label: string; ink: string }> = {
    protocol: { label: 'Core Protocol', ink: 'var(--cat-a)' },
    devtools: { label: 'Developer Tools', ink: 'var(--cat-b)' },
    security: { label: 'Security & Audit', ink: 'var(--cat-c)' },
    reference: { label: 'Reference Impl', ink: 'var(--cat-d)' },
    infra: { label: 'Critical Infra', ink: 'var(--cat-e)' },
    defi: { label: 'DeFi Seed', ink: 'var(--cat-f)' },
  };
  return map[id] || { label: id, ink: 'var(--ink-3)' };
}

export function statusTone(s: ProposalStatus): 'good' | 'bad' | 'warn' | 'soft' {
  return s === 'approved' ? 'good'
    : s === 'declined' ? 'bad'
    : s === 'voting' ? 'warn'
    : 'soft';
}

const startOfQuarter = (y: number, q: number) => new Date(y, q * 3, 1);
const endOfQuarter = (y: number, q: number) => new Date(y, q * 3 + 3, 0);

export function budgetForRange(quarters: Quarter[], from: Date | null, to: Date | null): number {
  if (!from && !to) return quarters.reduce((s, q) => s + q.defined, 0);
  const f = from ?? new Date(2000, 0, 1);
  const t = to ?? new Date(2100, 0, 1);
  let total = 0;
  quarters.forEach((q) => {
    const [yStr, qStr] = q.id.split('-');
    const y = +yStr;
    const qi = +qStr.replace('Q', '') - 1;
    const qStart = startOfQuarter(y, qi);
    const qEnd = endOfQuarter(y, qi);
    const overlapStart = qStart > f ? qStart : f;
    const overlapEnd = qEnd < t ? qEnd : t;
    if (overlapEnd < overlapStart) return;
    const qDays = (qEnd.getTime() - qStart.getTime()) / 86400000 + 1;
    const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000 + 1;
    total += q.defined * (overlapDays / qDays);
  });
  return total;
}

export function inRange(date: Date | string | null, from: Date | null, to: Date | null): boolean {
  if (!date) return false;
  if (!from && !to) return true;
  const d = date instanceof Date ? date : new Date(date);
  if (from && d < from) return false;
  if (to && d > new Date(to.getTime() + 86400000)) return false;
  return true;
}

export function defaultPeriod(): Period {
  const TODAY = new Date();
  const y = TODAY.getFullYear();
  const q = Math.floor(TODAY.getMonth() / 3);
  return {
    from: startOfQuarter(y, q),
    to: endOfQuarter(y, q),
    label: `Q${q + 1} ${y}`,
    preset: 'quarter',
  };
}
