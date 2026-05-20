'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Sidebar from '@/components/sidebar';
import Topbar from '@/components/topbar';
import OverviewView from '@/components/views/overview';
import VotingView from '@/components/views/voting';
import ProposalsView from '@/components/views/proposals';
import MilestonesView from '@/components/views/milestones';
import PaymentsView from '@/components/views/payments';
import BudgetView from '@/components/views/budget';
import ProcessView from '@/components/views/process';
import ProposalDrawer from '@/components/proposal-drawer';
import LoginModal from '@/components/login-modal';
import { getData } from '@/lib/data';
import { fetchLiveData } from '@/lib/live-data';
import { defaultPeriod } from '@/lib/utils';
import type { AppData, Period, Proposal } from '@/lib/types';

interface User {
  handle: string;
  initials: string;
  team: string;
}

// Set ?mock=1 in URL to fall back to mock data
function useDataSource(): { data: AppData | null; loading: boolean; error: string | null; isLive: boolean } {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const useMock = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('mock') === '1';
    if (useMock) {
      setData(getData());
      setIsLive(false);
      setLoading(false);
      return;
    }
    fetchLiveData()
      .then((d) => {
        setData(d);
        setIsLive(true);
        setLoading(false);
      })
      .catch((e: Error) => {
        console.error('Live data failed, falling back to mock:', e);
        setError(e.message);
        setData(getData());
        setIsLive(false);
        setLoading(false);
      });
  }, []);

  return { data, loading, error, isLive };
}

export default function Home() {
  const { data, loading, error, isLive } = useDataSource();
  const { data: session } = useSession();
  const [view, setView] = useState('overview');
  const [period, setPeriod] = useState<Period>(() => defaultPeriod());
  const [showLogin, setShowLogin] = useState(false);
  const [openProp, setOpenProp] = useState<Proposal | null>(null);

  // Derive sign-in state from NextAuth session
  const signedIn = !!session?.user;
  const user: User | null = session?.user
    ? {
        handle: session.user.githubLogin || session.user.name || 'user',
        initials: (session.user.name || session.user.githubLogin || 'U').slice(0, 2).toUpperCase(),
        team: session.user.role || 'viewer',
      }
    : null;

  if (loading || !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--ink-3)', fontSize: 14 }}>
        Loading proposals from GitHub…
      </div>
    );
  }

  const counts = {
    voting: data.votingQueue.length,
    proposals: data.proposals.length,
    milestonesPending: data.proposals
      .filter((p) => p.status === 'approved')
      .flatMap((p) => p.milestones)
      .filter((m) => m.status !== 'delivered').length,
    payments: data.payments.length,
  };

  const openProposal = (p: Proposal) => setOpenProp(p);
  // Voting happens on GitHub via gitvote — no in-dashboard voting

  let viewEl: React.ReactNode = null;
  switch (view) {
    case 'overview': viewEl = <OverviewView data={data} period={period} signedIn={signedIn} openProposal={openProposal} />; break;
    case 'voting': viewEl = <VotingView data={data} signedIn={signedIn} openProposal={openProposal} />; break;
    case 'proposals': viewEl = <ProposalsView data={data} period={period} openProposal={openProposal} />; break;
    case 'milestones': viewEl = <MilestonesView data={data} period={period} openProposal={openProposal} />; break;
    case 'payments': viewEl = <PaymentsView data={data} period={period} />; break;
    case 'budget': viewEl = <BudgetView data={data} period={period} />; break;
    case 'process': viewEl = <ProcessView />; break;
    default: viewEl = <OverviewView data={data} period={period} signedIn={signedIn} openProposal={openProposal} />;
  }

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} signedIn={signedIn} openLogin={() => setShowLogin(true)} counts={counts} />
      <Topbar
        view={view}
        period={period}
        setPeriod={setPeriod}
        signedIn={signedIn}
        openLogin={() => setShowLogin(true)}
        logout={() => signOut({ callbackUrl: '/' })}
        user={user}
      />
      <main className="main">
        {!isLive && error && (
          <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--warn)' }}>
            ⚠ Using mock data — live fetch failed: {error}
          </div>
        )}
        {!isLive && !error && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: 'var(--ink-3)' }}>
            Showing mock data (?mock=1). Remove the query param to load live data.
          </div>
        )}
        {viewEl}
      </main>

      {openProp && (
        <ProposalDrawer proposal={openProp} onClose={() => setOpenProp(null)} signedIn={signedIn} data={data} />
      )}

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} />
      )}
    </div>
  );
}
