'use client';

import type { ReactNode } from 'react';
import { IconGitHub } from '@/components/ui/icons';
import { Pill } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PR_TEMPLATE = `---
proposal_id:     PR-072
title:           Daml LSP performance overhaul
applicant:       Obsidian Systems
champion:        @m-langyintuo
category:        devtools   # protocol|devtools|security|reference|infra|defi
quarter:         2026-Q2
amount_cc:       420000
duration_months: 5
milestones:
  - id: M1
    title: Profiling harness + baseline
    amount_cc: 90000
    due: 2026-07-15
    acceptance: Public benchmark suite, baseline metrics committed
  - id: M2
    title: Type-checker hot path
    amount_cc: 140000
    due: 2026-09-01
    acceptance: 30% faster type-check on reference repo
success_metrics:
  - LSP cold start < 800ms on reference repo
  - Hover/completion p95 < 120ms
---`;

const MILESTONE_TEMPLATE = `---
parent_proposal: PR-072
milestone_id:    M1
amount_cc:       90000
due:             2026-07-15
recipient_party: obsidian-systems::1220abc...
---

## Acceptance checklist
- [ ] Public repo link & commit SHA
- [ ] Demo / artifact attached
- [ ] CI green on reference benchmark
- [ ] Champion sign-off
- [ ] Committee verification (>=3)

## Payout
On close with all boxes checked, the dashboard prompts the committee
to trigger the on-chain mint. Recipient mints CC directly per CIP-0100.
Tx hash is back-written to this issue.`;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface YamlBlockProps {
  code: string;
}

function YamlBlock({ code }: YamlBlockProps) {
  const lines = code.split('\n');
  return (
    <div className="code">
      {lines.map((line, i) => {
        const cm = line.match(/^(.*?)(#.*)$/);
        let preComment = line;
        let comment = '';
        if (cm) {
          preComment = cm[1];
          comment = cm[2];
        }
        const kv = preComment.match(/^(\s*-?\s*)([\w_]+):(.*)$/);
        if (kv) {
          const [, indent, key, rest] = kv;
          const valTrim = rest.replace(/^\s+/, '');
          const isNum = /^-?\d+$/.test(valTrim);
          return (
            <div key={i}>
              <span>{indent}</span>
              <span className="k">{key}</span>
              <span>:</span>
              <span>{rest.startsWith(' ') ? ' ' : ''}</span>
              {valTrim && <span className={isNum ? 'n' : 's'}>{valTrim}</span>}
              {comment && <span className="c"> {comment}</span>}
            </div>
          );
        }
        return (
          <div key={i}>
            <span>{preComment}</span>
            {comment && <span className="c">{comment}</span>}
          </div>
        );
      })}
    </div>
  );
}

interface ProcessStepProps {
  n: number;
  title: string;
  children: ReactNode;
}

function ProcessStep({ n, title, children }: ProcessStepProps) {
  return (
    <div className="process-step">
      <div className="process-num">{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{title}</div>
        <div style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

interface InsightProps {
  n: string;
  title: string;
  children: ReactNode;
}

function Insight({ n, title, children }: InsightProps) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--accent)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ProcessView                                                        */
/* ------------------------------------------------------------------ */

export default function ProcessView() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Process &amp; PR spec</h1>
          <p className="page-sub">
            Recommended additions to the proposal PR template so this dashboard can ingest data
            directly from{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              canton-foundation/canton-dev-fund
            </span>
            .
          </p>
        </div>
        <div className="row">
          <a
            className="btn btn-primary"
            href="https://github.com/canton-foundation/canton-dev-fund/blob/main/PROPOSAL-TEMPLATE.md"
            target="_blank"
            rel="noreferrer"
          >
            <IconGitHub /> Open PR with template
          </a>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Lifecycle</h3>
              <p className="card-sub">From open PR to milestone payout</p>
            </div>
          </div>
          <div>
            <ProcessStep n={1} title="Open PR with proposal template">
              Contributor (or champion on their behalf) opens a PR adding
              <code> proposals/&lt;slug&gt;.md</code>. Labels auto-applied:{' '}
              <code>status:submitted</code> + <code>category:*</code>.
            </ProcessStep>
            <ProcessStep n={2} title="Champion review">
              A Tech &amp; Ops Committee member self-assigns as Champion. Label moves to{' '}
              <code>status:champion-review</code>. Dashboard surfaces the PR in the Proposals view.
            </ProcessStep>
            <ProcessStep n={3} title="Tech review">
              Champion requests reviews from subject-matter experts. Label{' '}
              <code>status:tech-review</code>. Comments are aggregated into the proposal detail
              drawer.
            </ProcessStep>
            <ProcessStep n={4} title="Weekly voting batch">
              Friday 17:00 UTC &mdash; proposals tagged <code>status:voting</code> enter the
              <strong> This week&rsquo;s voting</strong> view. Quorum: 5 of 8 committee members.
            </ProcessStep>
            <ProcessStep n={5} title="Approved → projects/5 milestone board">
              On approval, automation creates one issue per milestone in{' '}
              <code>projects/5/views/1</code> with <code>parent_proposal</code> link,{' '}
              <code>amount_cc</code>, and <code>due_date</code> fields.
            </ProcessStep>
            <ProcessStep n={6} title="Delivery & payout">
              When a milestone issue is closed by the Champion with <code>delivered:true</code>,
              the dashboard prompts the committee to verify and trigger the on-chain mint (recipient
              mints CC directly &mdash; funds do not route through the Foundation, per CIP-0100).
            </ProcessStep>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <div>
                <h3 className="card-title">Suggested PR front-matter</h3>
                <p className="card-sub">
                  YAML block at the top of <code>proposals/&lt;slug&gt;.md</code>
                </p>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}>
                Copy
              </button>
            </div>
            <YamlBlock code={PR_TEMPLATE} />
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Label scheme</h3>
                <p className="card-sub">GitHub labels that drive automation</p>
              </div>
            </div>
            <table className="tbl" style={{ fontSize: 11.5 }}>
              <tbody>
                <tr>
                  <td>
                    <Pill tone="soft" dot="var(--s-submitted)">
                      status:submitted
                    </Pill>
                  </td>
                  <td>Awaiting champion</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="soft" dot="var(--s-champion)">
                      status:champion-review
                    </Pill>
                  </td>
                  <td>Champion assigned</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="soft" dot="var(--s-tech)">
                      status:tech-review
                    </Pill>
                  </td>
                  <td>Out for technical review</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="warn" dot="var(--s-voting)">
                      status:voting
                    </Pill>
                  </td>
                  <td>In this week&rsquo;s vote batch</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="good" dot="var(--s-approved)">
                      status:approved
                    </Pill>
                  </td>
                  <td>Approved, milestones live</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="bad" dot="var(--s-declined)">
                      status:declined
                    </Pill>
                  </td>
                  <td>Declined with rationale</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="info">category:&lt;id&gt;</Pill>
                  </td>
                  <td>One of 6 from CIP-0082</td>
                </tr>
                <tr>
                  <td>
                    <Pill tone="info">budget:Q&lt;n&gt;-YYYY</Pill>
                  </td>
                  <td>Maps to budget envelope</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Milestone issue template (projects/5)</h3>
            <p className="card-sub">
              Each approved milestone gets its own issue with a closing checklist
            </p>
          </div>
        </div>
        <YamlBlock code={MILESTONE_TEMPLATE} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Why this matters</h3>
            <p className="card-sub">Three small structural changes unlock the dashboard</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <Insight n="01" title="Machine-readable amounts">
            Today the funding ask lives in prose. Putting <code>amount_cc</code> in YAML lets the
            dashboard roll up <em>defined vs. allotted</em> without manual reconciliation each
            Friday.
          </Insight>
          <Insight n="02" title="Milestones as first-class issues">
            One issue per milestone with structured fields makes the <strong>37/40</strong> question
            a pure aggregate &mdash; no spreadsheets, no drift between repo and reality.
          </Insight>
          <Insight n="03" title="Status labels drive the funnel">
            A consistent <code>status:*</code> label is the only contract the dashboard needs to
            mirror the Projects board and surface the weekly voting queue automatically.
          </Insight>
        </div>
      </div>
    </>
  );
}
