// Ledger-driven sync.
//
// Three data sources:
//   1. Ledger issue (#1 in dashboard repo) — APPROVED projects + milestones + payments
//   2. Board #3 / PR labels — voting queue + pipeline lifecycle
//   3. Board #3 column counts — high-level funnel state
//
// No markdown parsing of canton-dev-fund/proposals/*.md anymore.
// Approved data is hand-maintained in the YAML ledger.

import crypto from 'crypto';
import { db, schema } from './client';
import { eq } from 'drizzle-orm';
import { fetchLedger, type LedgerProject } from '@/lib/github/ledger';
import { fetchAllPRLifecycles, getPipelineLifecycles, type PRLifecycle } from '@/lib/github/lifecycle';

export interface SyncResult {
  sync_id: string;
  approved_synced: number;
  milestones_synced: number;
  payments_synced: number;
  pipeline_synced: number;
  errors: { source: string; error: string }[];
  duration_ms: number;
  ledger_url?: string;
}

function genId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

export async function syncProposals(): Promise<SyncResult> {
  const start = Date.now();
  const sync_id = genId('sync');
  const errors: { source: string; error: string }[] = [];

  db.insert(schema.sync_log).values({
    id: sync_id,
    sync_type: 'full_sync',
    source: 'ledger+prs',
    status: 'started',
  }).run();

  let approved_synced = 0;
  let milestones_synced = 0;
  let payments_synced = 0;
  let pipeline_synced = 0;
  let ledgerUrl: string | undefined;

  try {
    // Pull ledger + PR lifecycles in parallel
    const [ledgerResult, lifecycles] = await Promise.all([
      fetchLedger(),
      fetchAllPRLifecycles().catch((e) => {
        errors.push({ source: 'pr-lifecycles', error: (e as Error).message });
        return [] as PRLifecycle[];
      }),
    ]);

    if (!ledgerResult) {
      errors.push({ source: 'ledger', error: 'Ledger issue not reachable or could not parse YAML' });
    } else {
      ledgerUrl = ledgerResult.issue_url;
      const result = upsertLedgerProjects(ledgerResult.data.projects, lifecycles);
      approved_synced = result.approved;
      milestones_synced = result.milestones;
      payments_synced = result.payments;
    }

    // Pipeline (non-approved): open / closed-unmerged PRs that propose new files
    const pipeline = getPipelineLifecycles(lifecycles);
    const ledgerPRs = new Set((ledgerResult?.data.projects ?? []).map((p) => p.pr));
    pipeline_synced = upsertPipelineLifecycles(pipeline, ledgerPRs);

    const duration_ms = Date.now() - start;
    db.update(schema.sync_log)
      .set({
        status: 'completed',
        items_processed: approved_synced + pipeline_synced,
        errors: errors.length ? JSON.stringify(errors) : null,
        completed_at: new Date().toISOString(),
      })
      .where(eq(schema.sync_log.id, sync_id))
      .run();

    return {
      sync_id,
      approved_synced,
      milestones_synced,
      payments_synced,
      pipeline_synced,
      errors,
      duration_ms,
      ledger_url: ledgerUrl,
    };
  } catch (e) {
    db.update(schema.sync_log)
      .set({
        status: 'failed',
        errors: JSON.stringify([{ source: 'sync', error: (e as Error).message }]),
        completed_at: new Date().toISOString(),
      })
      .where(eq(schema.sync_log.id, sync_id))
      .run();
    throw e;
  }
}

const LEDGER_OWNED_FIELDS = new Set([
  'title', 'author', 'champion', 'category', 'total_funding_cc',
  'quarter', 'approved_date',
]);

function upsertLedgerProjects(
  projects: LedgerProject[],
  lifecycles: PRLifecycle[],
): { approved: number; milestones: number; payments: number } {
  const lifecycleByPR = new Map(lifecycles.map((lc) => [lc.pr_number, lc]));
  let approved = 0;
  let msCount = 0;
  let payCount = 0;

  for (const p of projects) {
    // Skip if this project's specific fields are locked by admin overrides;
    // otherwise upsert from ledger.
    const existing = db.select().from(schema.proposals).where(eq(schema.proposals.id, p.id)).get();
    const overrides: string[] = existing?.overrides ? JSON.parse(existing.overrides) : [];
    const isOverridden = (field: string) => overrides.includes(field);

    const lc = lifecycleByPR.get(p.pr);
    const filename = `ledger:${p.id}`;
    const now = new Date().toISOString();
    const labels = lc?.labels ?? [];
    const ccTotal = p.total_cc || p.milestones.reduce((s, m) => s + m.amount_cc, 0);

    const values = {
      id: p.id,
      filename,
      github_pr_number: p.pr,
      pr_state: lc?.pr_state ?? 'closed',
      pr_merged: lc?.pr_merged ?? true,
      in_repo: true,
      title: isOverridden('title') ? existing!.title : p.title,
      author: isOverridden('author') ? existing!.author : p.applicant,
      author_email: null,
      github_author: lc?.author ?? null,
      champion: isOverridden('champion') ? existing!.champion : (p.champion ?? null),
      status: 'approved',
      category: isOverridden('category') ? existing!.category : (p.category ?? null),
      raw_category: p.category ?? null,
      labels: JSON.stringify(labels),
      total_funding_cc: isOverridden('total_funding_cc') ? existing!.total_funding_cc : ccTotal,
      created_date: p.approved_date ?? null,
      updated_date: null,
      approved_date: isOverridden('approved_date') ? existing!.approved_date : (p.approved_date ?? null),
      quarter: isOverridden('quarter') ? existing!.quarter : (p.quarter ?? null),
      website: null,
      twitter: null,
      raw_content_hash: null,
      parse_warnings: '[]',
      overrides: JSON.stringify(overrides),
      milestones_locked: existing?.milestones_locked ?? false,
      updated_at: now,
      synced_at: now,
    };

    db.insert(schema.proposals)
      .values(values)
      .onConflictDoUpdate({
        target: schema.proposals.id,
        set: {
          title: values.title,
          author: values.author,
          champion: values.champion,
          category: values.category,
          status: 'approved',
          total_funding_cc: values.total_funding_cc,
          approved_date: values.approved_date,
          quarter: values.quarter,
          github_pr_number: values.github_pr_number,
          labels: values.labels,
          updated_at: now,
          synced_at: now,
        } as Record<string, unknown>,
      })
      .run();
    approved++;

    // Respect milestones_locked
    if (existing?.milestones_locked) continue;

    // Replace milestones from ledger
    db.delete(schema.milestones).where(eq(schema.milestones.proposal_id, p.id)).run();
    for (const m of p.milestones) {
      const mid = `${p.id}-M${m.n}`;
      const status = m.status === 'delivered' ? 'delivered'
        : m.status === 'in_progress' ? 'in-progress'
        : 'planned';
      db.insert(schema.milestones).values({
        id: mid,
        proposal_id: p.id,
        milestone_number: m.n,
        title: m.title,
        funding_cc: m.amount_cc,
        estimated_delivery: m.due_date ?? null,
        estimated_delivery_date: m.due_date ?? null,
        status,
        payment_released_at: m.released_date ?? null,
      }).run();
      msCount++;

      // Create payment row for delivered milestones
      if (m.status === 'delivered') {
        // Delete any existing auto-recorded payment for this milestone, then re-insert
        db.delete(schema.payments).where(eq(schema.payments.milestone_id, mid)).run();
        db.insert(schema.payments).values({
          id: `pay-${mid}`,
          milestone_id: mid,
          amount_cc: m.amount_cc,
          released_date: m.released_date ?? null,
          status: 'released',
          transaction_hash: m.tx ?? null,
          notes: 'From ledger',
          evidence_url: m.evidence ?? null,
        }).run();
        payCount++;
      }
    }
  }

  return { approved, milestones: msCount, payments: payCount };
}

function upsertPipelineLifecycles(
  lifecycles: PRLifecycle[],
  ledgerPRs: Set<number>,
): number {
  let synced = 0;
  for (const lc of lifecycles) {
    // Skip PRs that are now approved (in ledger) — they're handled above
    if (ledgerPRs.has(lc.pr_number)) continue;

    const pseudoFilename = `pr:${lc.pr_number}`;
    const id = `PR-${lc.pr_number}`;
    const titleClean = lc.pr_title.replace(/^Proposal:\s*/i, '').trim() || `PR #${lc.pr_number}`;
    const now = new Date().toISOString();

    db.insert(schema.proposals)
      .values({
        id,
        filename: pseudoFilename,
        github_pr_number: lc.pr_number,
        pr_state: lc.pr_state,
        pr_merged: lc.pr_merged,
        in_repo: false,
        title: titleClean,
        author: lc.author,
        github_author: lc.author,
        status: lc.derived_status,
        labels: JSON.stringify(lc.labels),
        total_funding_cc: 0,
        created_date: lc.pr_created_at.split('T')[0],
        quarter: deriveQuarter(lc.pr_created_at),
        updated_at: now,
        synced_at: now,
      })
      .onConflictDoUpdate({
        target: schema.proposals.id,
        set: {
          status: lc.derived_status,
          labels: JSON.stringify(lc.labels),
          pr_state: lc.pr_state,
          pr_merged: lc.pr_merged,
          title: titleClean,
          updated_at: now,
          synced_at: now,
        } as Record<string, unknown>,
      })
      .run();
    synced++;
  }
  return synced;
}

function deriveQuarter(createdISO: string | null): string {
  if (!createdISO) return '';
  const d = new Date(createdISO);
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
