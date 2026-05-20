'use client';

import { useState, useMemo } from 'react';
import type { AppData, Period, Proposal, ProposalStatus } from '@/lib/types';
import { fmtCC, fmtDate, statusMeta, statusTone, inRange } from '@/lib/utils';
import { IconExport, IconGitHub, IconSearch, IconChevron } from '@/components/ui/icons';
import { Pill, Chip } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ */
/*  Sortable table header                                              */
/* ------------------------------------------------------------------ */

interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

interface ThProps {
  label: string;
  sortKey?: string;
  sort?: SortState;
  setSort?: (s: SortState) => void;
  align?: 'left' | 'right';
}

function Th({ label, sortKey, sort, setSort, align }: ThProps) {
  const active = sortKey && sort?.key === sortKey;
  const click = () => {
    if (!sortKey || !setSort || !sort) return;
    if (active) setSort({ key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key: sortKey, dir: 'desc' });
  };
  return (
    <th
      style={{ cursor: sortKey ? 'pointer' : 'default', textAlign: align || 'left' }}
      onClick={click}
    >
      <span
        className="row"
        style={{ gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {label}
        {active && <IconChevron dir={sort!.dir === 'asc' ? 'up' : 'down'} size={10} />}
      </span>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/*  ProposalsView                                                      */
/* ------------------------------------------------------------------ */

interface ProposalsViewProps {
  data: AppData;
  period: Period;
  openProposal: (p: Proposal) => void;
}

export default function ProposalsView({ data, period, openProposal }: ProposalsViewProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'submitted_at', dir: 'desc' });

  const rows = useMemo(() => {
    let r = data.proposals.slice();
    r = r.filter((p) => inRange(p.submitted_at, period.from, period.to));
    if (statusFilter !== 'all') r = r.filter((p) => p.status === statusFilter);
    if (catFilter !== 'all') r = r.filter((p) => p.category === catFilter);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(
        (p) =>
          p.title.toLowerCase().includes(s) ||
          p.applicant.toLowerCase().includes(s) ||
          p.id.toLowerCase().includes(s) ||
          p.champion.toLowerCase().includes(s),
      );
    }
    r.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.key];
      const bv = (b as unknown as Record<string, unknown>)[sort.key];
      if (av instanceof Date && bv instanceof Date)
        return (sort.dir === 'asc' ? 1 : -1) * (av.getTime() - bv.getTime());
      if (typeof av === 'number' && typeof bv === 'number')
        return (sort.dir === 'asc' ? 1 : -1) * (av - bv);
      return (sort.dir === 'asc' ? 1 : -1) * String(av).localeCompare(String(bv));
    });
    return r;
  }, [data.proposals, statusFilter, catFilter, search, sort, period]);

  const periodProposals = data.proposals.filter((p) =>
    inRange(p.submitted_at, period.from, period.to),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Proposals</h1>
          <p className="page-sub">
            <strong style={{ color: 'var(--ink-1)' }}>{periodProposals.length}</strong> submissions
            in {period.label}. Click any row for milestones, ledger, and review history.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-ghost">
            <IconExport /> Export CSV
          </button>
          <button className="btn btn-primary">
            <IconGitHub /> New from PR
          </button>
        </div>
      </div>

      <div className="filterbar">
        <Chip on={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          All <span style={{ color: 'var(--ink-4)' }}>{periodProposals.length}</span>
        </Chip>
        {data.STATUSES.map((s) => {
          const n = periodProposals.filter((p) => p.status === s).length;
          return (
            <Chip key={s} on={statusFilter === s} onClick={() => setStatusFilter(s)}>
              <span className="pill-dot" style={{ background: statusMeta[s as ProposalStatus]?.dot }} />
              {statusMeta[s as ProposalStatus]?.label} <span style={{ color: 'var(--ink-4)' }}>{n}</span>
            </Chip>
          );
        })}
        <div style={{ width: 1, height: 18, background: 'var(--line)' }} />
        <Chip on={catFilter === 'all'} onClick={() => setCatFilter('all')}>
          All categories
        </Chip>
        {data.CATEGORIES.map((c) => (
          <Chip key={c.id} on={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
            <span
              className="tag-dot"
              style={{
                background: `var(--cat-${c.tone})`,
                width: 6,
                height: 6,
                borderRadius: 2,
                display: 'inline-block',
              }}
            />
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <div className="search" style={{ minWidth: 240, maxWidth: 320 }}>
            <IconSearch />
            <input
              placeholder="Search by title, applicant, champion, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grow" />
          <span className="muted" style={{ fontSize: 12 }}>
            {rows.length} of {periodProposals.length}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 11 }}>
            Group by
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }}>
            Columns
          </button>
        </div>

        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <Th label="ID" sortKey="id" sort={sort} setSort={setSort} />
                <Th label="Proposal" sortKey="title" sort={sort} setSort={setSort} />
                <Th label="Champion" sortKey="champion" sort={sort} setSort={setSort} />
                <Th label="Category" sortKey="category" sort={sort} setSort={setSort} />
                <Th label="Status" sortKey="status" sort={sort} setSort={setSort} />
                <Th label="Milestones" />
                <Th label="Ask (CC)" sortKey="amount_cc" sort={sort} setSort={setSort} align="right" />
                <Th label="Submitted" sortKey="submitted_at" sort={sort} setSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cat = data.CATEGORIES.find((c) => c.id === p.category);
                const delivered = p.milestones.filter((m) => m.status === 'delivered').length;
                const pct = p.milestones.length
                  ? (delivered / p.milestones.length) * 100
                  : 0;
                return (
                  <tr key={p.id} className="row" onClick={() => openProposal(p)}>
                    <td className="mono">{p.id}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.title}</div>
                      <div style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                        {p.applicant} &middot; PR #{p.pr_number}
                      </div>
                    </td>
                    <td>{p.champion}</td>
                    <td>
                      <span className="tag">
                        <span
                          className="tag-dot"
                          style={{
                            background: `var(--cat-${cat?.tone || 'a'})`,
                          }}
                        />
                        {cat?.label || p.category}
                      </span>
                    </td>
                    <td>
                      <Pill tone={statusTone(p.status)} dot={statusMeta[p.status]?.dot}>
                        {statusMeta[p.status]?.label}
                      </Pill>
                    </td>
                    <td>
                      {p.status === 'approved' ? (
                        <div className="row" style={{ gap: 4 }}>
                          <span className="mini-prog good">
                            <div style={{ width: `${pct}%` }} />
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11.5,
                              color: 'var(--ink-3)',
                            }}
                          >
                            {delivered}/{p.milestones.length}
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11.5,
                            color: 'var(--ink-4)',
                          }}
                        >
                          {p.milestones.length} planned
                        </span>
                      )}
                    </td>
                    <td className="num">{fmtCC(p.amount_cc)}</td>
                    <td style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                      {fmtDate(p.submitted_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
