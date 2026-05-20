'use client';

import { Fragment } from 'react';
import {
  DashGlyph,
  VoteGlyph,
  ProposalsGlyph,
  MilestoneGlyph,
  CoinGlyph,
  ChartGlyph,
  DocGlyph,
} from '@/components/ui/icons';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  signedIn: boolean;
  openLogin: () => void;
  counts: {
    voting: number;
    proposals: number;
    milestonesPending: number;
    payments: number;
  };
}

interface NavItem {
  id: string;
  label: string;
  glyph: React.ReactNode;
  count?: number;
}

interface NavSection {
  group: string;
  items: NavItem[];
}

export default function Sidebar({ view, setView, counts }: SidebarProps) {
  const navItems: NavSection[] = [
    {
      group: 'Workspace',
      items: [
        { id: 'overview',   label: 'Overview',             glyph: <DashGlyph /> },
        { id: 'voting',     label: 'This week’s voting', glyph: <VoteGlyph />,      count: counts.voting },
        { id: 'proposals',  label: 'Proposals',            glyph: <ProposalsGlyph />, count: counts.proposals },
        { id: 'milestones', label: 'Milestones',           glyph: <MilestoneGlyph />, count: counts.milestonesPending },
        { id: 'payments',   label: 'Payments',             glyph: <CoinGlyph />,      count: counts.payments },
      ],
    },
    {
      group: 'Reports',
      items: [
        { id: 'budget',  label: 'Budget & forecast', glyph: <ChartGlyph /> },
        { id: 'process', label: 'Process & PR spec', glyph: <DocGlyph /> },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">DF</div>
        <div>
          <div className="brand-name">Dev Fund</div>
          <div className="brand-sub">Tech &amp; Ops Committee</div>
        </div>
      </div>

      <div className="nav">
        {navItems.map((sec) => (
          <Fragment key={sec.group}>
            <div className="nav-section">{sec.group}</div>
            {sec.items.map((it) => (
              <div
                key={it.id}
                className={`nav-item ${view === it.id ? 'active' : ''}`}
                onClick={() => setView(it.id)}
              >
                <span className="nav-glyph">{it.glyph}</span>
                <span>{it.label}</span>
                {it.count != null && <span className="nav-count">{it.count}</span>}
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      <div className="sidebar-foot">
        <span className="dot" />
        <span>Synced with GitHub · 2m ago</span>
      </div>
    </aside>
  );
}
