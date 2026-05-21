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
import {
  buildBoard3StatusMap,
  fetchBoard3,
  fetchBoard5,
  getBoard5Milestones,
  type Board5MilestoneInfo,
} from '@/lib/github/project-boards';
import { fetchMilestoneIssues } from '@/lib/github/milestone-issues';
import { fetchPrProposalFundings } from '@/lib/github/pr-proposal';

export interface SyncResult {
  sync_id: string;
  approved_synced: number;
  milestones_synced: number;
  payments_synced: number;
  pipeline_synced: number;
  board5_overlay_applied: number; // count of milestones whose status/CC was overridden by Board #5
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
  let board5_overlay_applied = 0;
  let ledgerUrl: string | undefined;

  try {
    // Pull ledger + PR lifecycles + milestone issues + Project Boards (if scope granted) in parallel
    const [ledgerResult, lifecycles, milestoneIssues, board3, board5] = await Promise.all([
      fetchLedger(),
      fetchAllPRLifecycles().catch((e) => {
        errors.push({ source: 'pr-lifecycles', error: (e as Error).message });
        return [] as PRLifecycle[];
      }),
      fetchMilestoneIssues().catch(() => []),
      fetchBoard3(),  // null if read:project not granted
      fetchBoard5(),  // null if read:project not granted
    ]);

    if (!ledgerResult) {
      errors.push({ source: 'ledger', error: 'Ledger issue not reachable or could not parse YAML' });
    } else {
      ledgerUrl = ledgerResult.issue_url;
      const result = upsertLedgerProjects(ledgerResult.data.projects, lifecycles, milestoneIssues);
      approved_synced = result.approved;
      milestones_synced = result.milestones;
      payments_synced = result.payments;
    }

    // Pipeline (non-approved): open / closed-unmerged PRs that propose new files
    const pipeline = getPipelineLifecycles(lifecycles);
    const ledgerPRs = new Set((ledgerResult?.data.projects ?? []).map((p) => p.pr));

    // Board #3 (when reachable) is the authoritative source for pipeline status.
    // We DROP pipeline PRs that aren't tracked on Board #3 — those are stale,
    // abandoned, or otherwise filtered out of the committee's view.
    let pipelineToSync = pipeline;
    if (board3) {
      const board3Map = buildBoard3StatusMap(board3);
      console.log(`Board #3: ${board3Map.size} items with status`);
      // Override status from board for tracked PRs
      for (const lc of pipeline) {
        const b = board3Map.get(lc.pr_number);
        if (b) lc.derived_status = b.status;
      }
      // Drop pipeline items NOT on Board #3 (they're stale / abandoned)
      pipelineToSync = pipeline.filter((lc) => board3Map.has(lc.pr_number));
      // Also clean up any DB rows for PRs that should no longer be in the pipeline
      // (we'll do this via a deferred sweep below — see "stale pipeline cleanup")
    }
    pipeline_synced = upsertPipelineLifecycles(pipelineToSync, ledgerPRs);

    // Stale cleanup: when Board #3 is the truth, remove DB rows for PRs that are
    // neither on Board #3 nor in the ledger.
    if (board3) {
      const board3Map = buildBoard3StatusMap(board3);
      const validPRs = new Set<number>([...board3Map.keys(), ...ledgerPRs]);
      const stalePRs = db
        .select()
        .from(schema.proposals)
        .where(eq(schema.proposals.in_repo, false))
        .all()
        .filter((p) => p.github_pr_number !== null && !validPRs.has(p.github_pr_number));
      for (const stale of stalePRs) {
        db.delete(schema.proposals).where(eq(schema.proposals.id, stale.id)).run();
      }
      if (stalePRs.length > 0) {
        console.log(`Stale pipeline cleanup: removed ${stalePRs.length} PR(s) not on Board #3`);
      }
    }

    // Board #5 overlay — when read:project granted, board state is authoritative for
    // milestone delivery + payment status. This OVERRIDES whatever the ledger said.
    if (board5) {
      const board5Ms = getBoard5Milestones(board5);
      console.log(`Board #5: ${board5Ms.length} milestone items`);
      board5_overlay_applied = applyBoard5Overlay(board5Ms);
    }

    // Parse funding from voting-stage PRs (so "Total ask this week" isn't 0)
    const votingPRs = db
      .select({ pr: schema.proposals.github_pr_number })
      .from(schema.proposals)
      .where(eq(schema.proposals.status, 'voting'))
      .all()
      .map((r) => r.pr)
      .filter((n): n is number => n !== null && n > 0);
    if (votingPRs.length > 0) {
      const fundings = await fetchPrProposalFundings(votingPRs);
      console.log(`Voting PR funding parsed: ${fundings.size}/${votingPRs.length}`);
      for (const [pr, info] of fundings.entries()) {
        if (info.total_funding_cc > 0) {
          db.update(schema.proposals)
            .set({ total_funding_cc: info.total_funding_cc, title: info.title, updated_at: new Date().toISOString() })
            .where(eq(schema.proposals.github_pr_number, pr))
            .run();
        }
      }
    }

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
      board5_overlay_applied,
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

interface MilestoneIssueLite {
  issue_number: number;
  state: 'open' | 'closed';
  closed_at: string | null;
  pr_number: number | null;
  milestone_number: number | null;
}

function upsertLedgerProjects(
  projects: LedgerProject[],
  lifecycles: PRLifecycle[],
  milestoneIssues: MilestoneIssueLite[],
): { approved: number; milestones: number; payments: number } {
  const lifecycleByPR = new Map(lifecycles.map((lc) => [lc.pr_number, lc]));
  // Index milestone issues by (pr_number, milestone_number) for fast lookup
  const issueByKey = new Map<string, MilestoneIssueLite>();
  for (const mi of milestoneIssues) {
    if (mi.pr_number !== null && mi.milestone_number !== null) {
      issueByKey.set(`${mi.pr_number}:${mi.milestone_number}`, mi);
    }
  }
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
      // Link to the GitHub milestone-tracking issue if present (so Board #5 overlay can match)
      const issueLink = issueByKey.get(`${p.pr}:${m.n}`);
      db.insert(schema.milestones).values({
        id: mid,
        proposal_id: p.id,
        milestone_number: m.n,
        title: m.title,
        funding_cc: m.amount_cc,
        estimated_delivery: m.due_date ?? null,
        estimated_delivery_date: m.due_date ?? null,
        status,
        github_issue_number: issueLink?.issue_number ?? null,
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

/**
 * Apply Board #5 column status + Estimate (CC) as the authoritative overlay onto
 * milestones in our DB. We match by the milestone issue's GitHub issue number
 * (populated earlier via milestone-issues.ts → milestones.github_issue_number).
 *
 * When a Board #5 item is in Done/Payment Released:
 *   - milestone.status = 'delivered'
 *   - a payment row is created/updated (idempotent)
 *
 * Returns the number of milestones whose state was overridden.
 */
function applyBoard5Overlay(items: Board5MilestoneInfo[]): number {
  let count = 0;
  const now = new Date().toISOString();

  // Cache proposals + their milestones for the title-based fallback
  const allProposals = db.select().from(schema.proposals).all();
  const allMilestones = db.select().from(schema.milestones).all();
  const proposalByPR = new Map(
    allProposals
      .filter((p) => p.github_pr_number !== null)
      .map((p) => [p.github_pr_number as number, p]),
  );

  // Helper: find DB milestone for a Board #5 item title like
  // "Q2 Maintenance of Canton Open Source 48 April"
  // Strategy: pull a PR-number candidate from the title, find that proposal,
  // then match a milestone whose title or estimated_delivery contains the month name.
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december'];
  const findByTitle = (boardTitle: string) => {
    const lower = boardTitle.toLowerCase();
    // Find a 2-4 digit number in the title that matches one of our PR numbers
    const numMatches = [...boardTitle.matchAll(/\b(\d{2,4})\b/g)].map((m) => parseInt(m[1], 10));
    let proposal;
    for (const n of numMatches) {
      if (proposalByPR.has(n)) {
        proposal = proposalByPR.get(n);
        break;
      }
    }
    if (!proposal) return undefined;
    // Month present in board title?
    const month = MONTHS.find((m) => lower.includes(m));
    if (!month) {
      // No month — try matching by explicit "Milestone N" in title
      const ms = boardTitle.match(/milestone\s+(\d+)/i);
      if (ms) {
        const n = parseInt(ms[1], 10);
        return allMilestones.find(
          (m) => m.proposal_id === proposal!.id && m.milestone_number === n,
        );
      }
      return undefined;
    }
    // Match by month name in milestone title or estimated_delivery
    return allMilestones.find(
      (m) =>
        m.proposal_id === proposal!.id &&
        ((m.title || '').toLowerCase().includes(month) ||
          (m.estimated_delivery || '').toLowerCase().includes(month)),
    );
  };

  for (const item of items) {
    // Match the DB milestone by github_issue_number first
    let matched = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.github_issue_number, item.issue_number))
      .get();
    // Fallback: title-based PR-number + month matcher (for maintenance milestones)
    if (!matched) {
      matched = findByTitle(item.title);
      // If we matched via fallback, record the issue number for next sync
      if (matched) {
        db.update(schema.milestones)
          .set({ github_issue_number: item.issue_number, updated_at: now })
          .where(eq(schema.milestones.id, matched.id))
          .run();
      }
    }
    if (!matched) continue;

    // Board #5 status is already a valid MilestoneStatus — pass through directly
    const overlayStatus = item.status;

    // Update milestone state (and CC if the Estimate field differs significantly from ours)
    const fundingFromBoard =
      item.estimate_cc && Math.abs(item.estimate_cc - matched.funding_cc) > 1000
        ? item.estimate_cc
        : matched.funding_cc;

    db.update(schema.milestones)
      .set({
        status: overlayStatus,
        board_status: item.board_status,
        funding_cc: fundingFromBoard,
        payment_released_at: overlayStatus === 'delivered' ? item.closed_at || now : null,
        updated_at: now,
      })
      .where(eq(schema.milestones.id, matched.id))
      .run();

    // If delivered → ensure a payment row exists
    if (overlayStatus === 'delivered') {
      const existing = db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.milestone_id, matched.id))
        .get();
      if (!existing) {
        db.insert(schema.payments).values({
          id: `pay-${matched.id}`,
          milestone_id: matched.id,
          amount_cc: fundingFromBoard,
          released_date: item.closed_at?.split('T')[0] ?? null,
          status: 'released',
          notes: `Auto-recorded from Board #5 (status: ${item.status})`,
          evidence_url: `https://github.com/canton-foundation/canton-dev-fund/issues/${item.issue_number}`,
        }).run();
      }
    } else {
      // Not delivered → remove any auto-recorded payment for this milestone
      db.delete(schema.payments)
        .where(eq(schema.payments.milestone_id, matched.id))
        .run();
    }
    count++;
  }
  return count;
}
