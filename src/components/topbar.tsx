'use client';

import { IconChevron, IconSearch, IconGitHub, IconX } from '@/components/ui/icons';
import { Pill } from '@/components/ui/pill';
import PeriodPicker from '@/components/period-picker';
import type { Period } from '@/lib/types';

interface TopbarProps {
  view: string;
  period: Period;
  setPeriod: (p: Period) => void;
  signedIn: boolean;
  openLogin: () => void;
  logout: () => void;
  user: { handle: string; initials: string; team: string } | null;
}

const titles: Record<string, string> = {
  overview:   'Overview',
  voting:     'This week’s voting',
  proposals:  'Proposals',
  milestones: 'Milestones',
  payments:   'Payments',
  budget:     'Budget & forecast',
  process:    'Process & PR spec',
};

export default function Topbar({ view, period, setPeriod, signedIn, openLogin, logout, user }: TopbarProps) {
  const showPeriod = !['voting', 'process'].includes(view);

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Dev Fund</span>
        <IconChevron dir="right" size={10} />
        <strong>{titles[view]}</strong>
      </div>

      <div className="search">
        <IconSearch />
        <input placeholder="Search proposals, milestones, applicants…" />
        <span className="kbd">⌘K</span>
      </div>

      <div className="topbar-spacer" />

      {showPeriod && <PeriodPicker value={period} onChange={setPeriod} />}

      {!signedIn ? (
        <button className="btn btn-primary" onClick={openLogin}>
          <IconGitHub /> Admin sign in
        </button>
      ) : (
        <div className="row" style={{ gap: 10 }}>
          <Pill tone="good" dot="var(--good)">Admin · {user?.handle}</Pill>
          <div className="avatar">{user?.initials}</div>
          <button className="btn btn-ghost" onClick={logout} title="Sign out">
            <IconX size={12} />
          </button>
        </div>
      )}
    </header>
  );
}
