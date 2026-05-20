'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtCC } from '@/lib/utils';

interface Proposal {
  id: string;
  filename: string;
  title: string;
  author: string | null;
  champion: string | null;
  status: string;
  category: string | null;
  total_funding_cc: number;
  quarter: string | null;
  website: string | null;
  twitter: string | null;
  github_pr_number: number | null;
  in_repo: boolean;
}

interface Milestone {
  id: string;
  proposal_id: string;
  milestone_number: number;
  title: string | null;
  funding_cc: number;
  estimated_delivery: string | null;
  status: string;
}

const STATUSES = ['submitted', 'champion-review', 'tech-review', 'voting', 'approved', 'declined'];
const CATEGORIES = ['protocol', 'devtools', 'security', 'reference', 'infra', 'defi'];
const MILESTONE_STATUSES = ['planned', 'in-progress', 'in-review', 'delivered', 'at-risk'];
const QUARTERS = ['2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];

export default function EditProposal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releaseModal, setReleaseModal] = useState<{
    milestone: Milestone;
    amount_cc: number;
    transaction_hash: string;
    released_date: string;
    evidence_url: string;
    notes: string;
    submitting: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('in-progress');

  useEffect(() => {
    fetch(`/api/admin/proposals/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((j) => {
        setProposal(j.proposal);
        setMilestones(j.milestones || []);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="empty">Error: {error}</div>;
  if (!proposal) return <div className="empty">Loading…</div>;

  const milestoneTotal = milestones.reduce((s, m) => s + Number(m.funding_cc || 0), 0);
  const mismatch = Math.abs(milestoneTotal - proposal.total_funding_cc) > 0;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposal, milestones }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  const addMilestone = () => {
    setMilestones((ms) => [
      ...ms,
      {
        id: `new-${Date.now()}`,
        proposal_id: id,
        milestone_number: ms.length + 1,
        title: `Milestone ${ms.length + 1}`,
        funding_cc: 0,
        estimated_delivery: null,
        status: 'planned',
      },
    ]);
  };

  const removeMilestone = (idx: number) => {
    if (!confirm('Remove this milestone?')) return;
    setMilestones((ms) => ms.filter((_, i) => i !== idx).map((m, i) => ({ ...m, milestone_number: i + 1 })));
  };

  const updateMilestone = (idx: number, patch: Partial<Milestone>) => {
    setMilestones((ms) => ms.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const openReleaseModal = (m: Milestone) => {
    setReleaseModal({
      milestone: m,
      amount_cc: m.funding_cc,
      transaction_hash: '',
      released_date: new Date().toISOString().split('T')[0],
      evidence_url: '',
      notes: '',
      submitting: false,
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === milestones.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(milestones.map((m) => m.id)));
    }
  };

  const applyBulkStatus = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const res = await fetch('/api/admin/milestones/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestone_ids: ids, status: bulkStatus }),
    });
    if (res.ok) {
      // Reflect change in local state
      setMilestones((ms) => ms.map((m) => (selected.has(m.id) ? { ...m, status: bulkStatus } : m)));
      setSelected(new Set());
    } else {
      const j = await res.json();
      alert(`Failed: ${j.error}`);
    }
  };

  const submitRelease = async () => {
    if (!releaseModal) return;
    if (!releaseModal.transaction_hash) {
      alert('Transaction hash is required');
      return;
    }
    setReleaseModal({ ...releaseModal, submitting: true });
    try {
      const res = await fetch(`/api/admin/milestones/${releaseModal.milestone.id}/release-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cc: releaseModal.amount_cc,
          transaction_hash: releaseModal.transaction_hash,
          released_date: releaseModal.released_date,
          evidence_url: releaseModal.evidence_url || undefined,
          notes: releaseModal.notes,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'release failed');
      // Refresh milestone list
      const r = await fetch(`/api/admin/proposals/${id}`);
      const d = await r.json();
      setMilestones(d.milestones || []);
      setReleaseModal(null);
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
      setReleaseModal({ ...releaseModal, submitting: false });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
            <Link href="/admin/proposals" style={{ color: 'var(--ink-3)' }}>← All proposals</Link>
            {' · '}
            <span className="mono">{proposal.id}</span>
            {proposal.github_pr_number && (
              <>
                {' · '}
                <a
                  href={`https://github.com/canton-foundation/canton-dev-fund/pull/${proposal.github_pr_number}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  PR #{proposal.github_pr_number} ↗
                </a>
              </>
            )}
          </div>
          <h1 className="page-title">{proposal.title}</h1>
          <p className="page-sub">
            Source: <strong style={{ color: 'var(--ink-1)' }}>{proposal.in_repo ? 'markdown in repo' : 'PR only (no file in main)'}</strong>.
            Overrides here win against re-syncs from GitHub for these specific fields.
          </p>
        </div>
        <div className="row">
          {saved && <span style={{ color: 'var(--good)', fontSize: 12 }}>✓ Saved</span>}
          {error && <span style={{ color: 'var(--bad)', fontSize: 12 }}>✗ {error}</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        {/* Proposal fields */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Proposal</h3>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Title">
              <input value={proposal.title} onChange={(e) => setProposal({ ...proposal, title: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Applicant / Author">
              <input value={proposal.author || ''} onChange={(e) => setProposal({ ...proposal, author: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Champion">
              <input value={proposal.champion || ''} onChange={(e) => setProposal({ ...proposal, champion: e.target.value })} placeholder="Champion name" style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Status">
                <select value={proposal.status} onChange={(e) => setProposal({ ...proposal, status: e.target.value })} style={inputStyle}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select value={proposal.category || ''} onChange={(e) => setProposal({ ...proposal, category: e.target.value || null })} style={inputStyle}>
                  <option value="">— None —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Quarter">
                <select value={proposal.quarter || ''} onChange={(e) => setProposal({ ...proposal, quarter: e.target.value || null })} style={inputStyle}>
                  <option value="">— None —</option>
                  {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </Field>
              <Field label="Total funding (CC)">
                <input type="number" min="0" value={proposal.total_funding_cc} onChange={(e) => setProposal({ ...proposal, total_funding_cc: Number(e.target.value) })} style={inputStyle} />
                {mismatch && (
                  <div style={{ fontSize: 10.5, color: 'var(--warn)', marginTop: 2 }}>
                    Milestones sum to {fmtCC(milestoneTotal)}
                  </div>
                )}
              </Field>
            </div>
            <Field label="Website">
              <input value={proposal.website || ''} onChange={(e) => setProposal({ ...proposal, website: e.target.value })} placeholder="https://…" style={inputStyle} />
            </Field>
            <Field label="Twitter / X">
              <input value={proposal.twitter || ''} onChange={(e) => setProposal({ ...proposal, twitter: e.target.value })} placeholder="https://x.com/…" style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Summary card */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Summary</h3>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <KV k="ID" v={<span className="mono">{proposal.id}</span>} />
            <KV k="Filename" v={<span className="mono" style={{ fontSize: 11 }}>{proposal.filename}</span>} />
            <KV k="Source" v={proposal.in_repo ? 'merged in repo' : 'PR-only'} />
            <KV k="Total ask" v={<><span className="mono">{fmtCC(proposal.total_funding_cc)}</span> CC</>} />
            <KV k="Milestones" v={`${milestones.length} (sum ${fmtCC(milestoneTotal)} CC)`} />
            <KV k="Status" v={proposal.status} />
            <KV k="Category" v={proposal.category || '—'} />
          </div>
          <div style={{ marginTop: 14, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
            ℹ Edits override values parsed from GitHub. The next sync will not overwrite manually-edited fields
            (planned — currently re-sync would clobber. Use protect flag in Phase 8).
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Milestones</h3>
            <p className="card-sub">{milestones.length} milestones · total {fmtCC(milestoneTotal)} CC</p>
          </div>
          <button className="btn btn-primary" onClick={addMilestone} type="button">+ Add milestone</button>
        </div>

        {/* Bulk action bar — shown when at least one selected */}
        {selected.size > 0 && (
          <div
            style={{
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 12.5,
            }}
          >
            <span>{selected.size} selected</span>
            <span style={{ color: 'var(--ink-3)' }}>→ Set status to</span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12 }}
            >
              {MILESTONE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={applyBulkStatus}>
              Apply
            </button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}

        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input
                  type="checkbox"
                  checked={milestones.length > 0 && selected.size === milestones.length}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
              <th style={{ width: 40 }}>#</th>
              <th>Title</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 140 }}>Delivery</th>
              <th style={{ width: 140, textAlign: 'right' }}>Funding (CC)</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {milestones.length === 0 && (
              <tr><td colSpan={7} className="empty">No milestones. Click &ldquo;+ Add milestone&rdquo; above.</td></tr>
            )}
            {milestones.map((m, i) => (
              <tr key={m.id} style={selected.has(m.id) ? { background: 'var(--surface-2)' } : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggleSelect(m.id)}
                  />
                </td>
                <td className="mono">{m.milestone_number}</td>
                <td>
                  <input
                    value={m.title || ''}
                    onChange={(e) => updateMilestone(i, { title: e.target.value })}
                    style={{ ...inputStyle, fontSize: 12.5 }}
                  />
                </td>
                <td>
                  <select
                    value={m.status}
                    onChange={(e) => updateMilestone(i, { status: e.target.value })}
                    style={{ ...inputStyle, fontSize: 12 }}
                  >
                    {MILESTONE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    value={m.estimated_delivery || ''}
                    onChange={(e) => updateMilestone(i, { estimated_delivery: e.target.value || null })}
                    placeholder="Month 1 or 2026-07-15"
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={m.funding_cc}
                    onChange={(e) => updateMilestone(i, { funding_cc: Number(e.target.value) })}
                    style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                  />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {m.status !== 'delivered' && (
                    <button
                      type="button"
                      className="btn btn-good"
                      style={{ fontSize: 11, padding: '3px 8px', marginRight: 4 }}
                      onClick={() => openReleaseModal(m)}
                      title="Mark this milestone delivered and release payment"
                    >
                      Release
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, color: 'var(--bad)' }}
                    onClick={() => removeMilestone(i)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <Link href="/admin/proposals" className="btn btn-ghost">Cancel</Link>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Release payment modal */}
      {releaseModal && (
        <div className="modal-scrim" onClick={() => !releaseModal.submitting && setReleaseModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
            <h3>Release payment</h3>
            <p style={{ marginBottom: 14 }}>
              Mark <strong>{releaseModal.milestone.title || `Milestone ${releaseModal.milestone.milestone_number}`}</strong> delivered and record the on-chain payment. Per CIP-0100, the recipient mints CC directly.
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              <label>
                <div style={fieldLabelStyle}>Amount (CC)</div>
                <input
                  type="number"
                  min="0"
                  value={releaseModal.amount_cc}
                  onChange={(e) => setReleaseModal({ ...releaseModal, amount_cc: Number(e.target.value) })}
                  style={modalInputStyle}
                />
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>
                  Milestone funding: {releaseModal.milestone.funding_cc.toLocaleString()} CC
                </div>
              </label>

              <label>
                <div style={fieldLabelStyle}>Transaction hash <span style={{ color: 'var(--bad)' }}>*</span></div>
                <input
                  type="text"
                  required
                  value={releaseModal.transaction_hash}
                  onChange={(e) => setReleaseModal({ ...releaseModal, transaction_hash: e.target.value })}
                  placeholder="0x…"
                  style={{ ...modalInputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </label>

              <label>
                <div style={fieldLabelStyle}>Released date</div>
                <input
                  type="date"
                  value={releaseModal.released_date}
                  onChange={(e) => setReleaseModal({ ...releaseModal, released_date: e.target.value })}
                  style={modalInputStyle}
                />
              </label>

              <label>
                <div style={fieldLabelStyle}>Evidence URL (optional)</div>
                <input
                  type="url"
                  value={releaseModal.evidence_url}
                  onChange={(e) => setReleaseModal({ ...releaseModal, evidence_url: e.target.value })}
                  placeholder="https://github.com/.../issues/123 or commit URL"
                  style={modalInputStyle}
                />
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>
                  Link to milestone delivery evidence (GitHub issue, comment, PR, demo)
                </div>
              </label>

              <label>
                <div style={fieldLabelStyle}>Notes (optional)</div>
                <textarea
                  rows={2}
                  value={releaseModal.notes}
                  onChange={(e) => setReleaseModal({ ...releaseModal, notes: e.target.value })}
                  placeholder="e.g. committee vote ref, evidence link"
                  style={{ ...modalInputStyle, resize: 'vertical' }}
                />
              </label>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReleaseModal(null)}
                disabled={releaseModal.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-good"
                onClick={submitRelease}
                disabled={releaseModal.submitting || !releaseModal.transaction_hash}
              >
                {releaseModal.submitting ? 'Releasing…' : 'Release payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
  fontWeight: 500,
};

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--ink-1)',
  fontFamily: 'inherit',
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </label>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ color: 'var(--ink-3)' }}>{k}</span>
      <span style={{ color: 'var(--ink-1)' }}>{v}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--ink-1)',
  fontFamily: 'inherit',
  fontSize: 13,
};
