'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fmtCC, fmtDate } from '@/lib/utils';

interface ProposalRow {
  id: string;
  title: string;
  author: string | null;
  status: string;
  category: string | null;
  total_funding_cc: number;
  github_pr_number: number | null;
  in_repo: boolean;
  updated_at: string;
}

export default function AdminProposalsList() {
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/admin/proposals')
      .then((r) => r.json())
      .then((j) => setRows(j.proposals || []));
  }, []);

  const filtered = rows.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !(p.author || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statuses = ['all', 'submitted', 'champion-review', 'tech-review', 'voting', 'approved', 'declined'];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Edit proposals</h1>
          <p className="page-sub">
            Override any field — title, applicant, champion, category, funding, milestones.
            Changes persist in the local DB and override what&rsquo;s parsed from GitHub.
          </p>
        </div>
      </div>

      <div className="filterbar">
        {statuses.map((s) => (
          <button
            key={s}
            className={`chip ${statusFilter === s ? 'on' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s} <span style={{ color: 'var(--ink-4)' }}>{s === 'all' ? rows.length : rows.filter((r) => r.status === s).length}</span>
          </button>
        ))}
      </div>

      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <div className="search" style={{ minWidth: 240 }}>
            <input
              placeholder="Search by title or applicant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grow" />
          <span className="muted" style={{ fontSize: 12 }}>{filtered.length} of {rows.length}</span>
        </div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Author</th>
                <th>Status</th>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Funding</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="empty">No proposals match.</td></tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="row">
                  <td className="mono" style={{ fontSize: 11 }}>{p.id}</td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>
                      {p.title.length > 60 ? p.title.slice(0, 60) + '…' : p.title}
                    </div>
                    {p.github_pr_number && (
                      <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>PR #{p.github_pr_number}</div>
                    )}
                  </td>
                  <td>{p.author || '—'}</td>
                  <td>
                    <span className={`pill pill-${p.status === 'approved' ? 'good' : p.status === 'declined' ? 'bad' : p.status === 'voting' ? 'warn' : 'soft'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.in_repo ? 'in repo' : 'PR-only'}</td>
                  <td className="num">{fmtCC(p.total_funding_cc)} <span style={{ color: 'var(--ink-4)' }}>CC</span></td>
                  <td style={{ fontSize: 11, color: 'var(--ink-3)' }}>{fmtDate(new Date(p.updated_at))}</td>
                  <td>
                    <Link href={`/admin/proposals/${p.id}`} className="btn btn-ghost" style={{ fontSize: 11 }}>
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
