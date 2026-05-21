// Derive proposal lifecycle status from PR labels (works with `repo` scope only).
// This replaces what Project Board #3 would give us if we had `read:project`.
//
// Label → status mapping (based on canton-dev-fund label taxonomy):
//   needs-sig-label / needs-champion → submitted
//   champion-confirmed → champion-review
//   Core/needs review or Security/needs review → tech-review
//   Core/ready for vote or Security/ready for vote → voting
//   Approved → approved
//   gitvote/failed (with closed PR) → declined
//   merged PR → approved
//
// Limitation: this is derived data. Once read:project is granted, replace
// with actual Project Board #3 column values (more authoritative).

import { paginatePulls } from './paginate';
import { getOctokit, REPO_NAME, REPO_OWNER } from './client';
import type { ProposalStatus } from '@/lib/types';

export interface PRLifecycle {
  pr_number: number;
  pr_title: string;
  pr_state: 'open' | 'closed';
  pr_merged: boolean;
  pr_merged_at: string | null;
  pr_created_at: string;
  labels: string[];
  derived_status: ProposalStatus;
  proposal_files: string[]; // .md files in /proposals/ this PR touches
  author: string | null;
}

export function deriveStatusFromLabels(
  labels: string[],
  prState: 'open' | 'closed',
  prMerged: boolean,
): ProposalStatus {
  const lower = labels.map((l) => l.toLowerCase());

  // Label-driven (most authoritative)
  if (labels.includes('Approved')) return 'approved';
  if (labels.includes('gitvote/passed')) return 'approved';

  // Voting — multiple variants for label catch-rate.
  // NOTE: this still misses proposals that sit in Project Board #3 "Voting Live" column
  // without a label applied. Granting read:project scope and querying the board directly
  // would fix that gap.
  if (lower.some((l) => l.includes('ready for vote') || l.includes('ready-for-vote'))) return 'voting';
  if (labels.includes('gitvote/open')) return 'voting';
  if (lower.some((l) => l.includes('voting'))) return 'voting';

  if (labels.includes('gitvote/failed') && prState === 'closed') return 'declined';
  if (lower.some((l) => l.includes('needs review'))) return 'tech-review';
  if (lower.some((l) => l.includes('revision needed'))) return 'tech-review';
  if (labels.includes('champion-confirmed')) return 'champion-review';
  if (labels.includes('needs-sig-label')) return 'submitted';
  if (labels.includes('needs-champion')) return 'submitted';
  // PR state fallbacks
  if (prMerged) return 'approved'; // merged but no explicit label
  if (prState === 'closed') return 'declined'; // closed without merge or approve label
  return 'submitted';
}

/**
 * Returns lifecycle info for every PR that touched a file in /proposals/.
 * One PR can touch multiple proposal files (rare but possible).
 */
export async function fetchAllPRLifecycles(): Promise<PRLifecycle[]> {
  const octokit = getOctokit();
  const prs = await paginatePulls(octokit, {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    state: 'all',
    per_page: 100,
  });

  const results: PRLifecycle[] = [];
  // Limit concurrency to avoid rate limits
  const BATCH = 8;
  for (let i = 0; i < prs.length; i += BATCH) {
    const batch = prs.slice(i, i + BATCH);
    const lifecycles = await Promise.allSettled(
      batch.map(async (pr) => {
        const filesRes = await octokit.pulls.listFiles({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          pull_number: pr.number,
          per_page: 100,
        });
        const proposalFiles = filesRes.data
          .filter((f) => f.filename.startsWith('proposals/') && f.filename.endsWith('.md'))
          .map((f) => f.filename.replace('proposals/', ''));

        const labels = pr.labels.map((l) => l.name);
        const merged = !!pr.merged_at;
        const lifecycle: PRLifecycle = {
          pr_number: pr.number,
          pr_title: pr.title,
          pr_state: pr.state as 'open' | 'closed',
          pr_merged: merged,
          pr_merged_at: pr.merged_at,
          pr_created_at: pr.created_at,
          labels,
          derived_status: deriveStatusFromLabels(labels, pr.state as 'open' | 'closed', merged),
          proposal_files: proposalFiles,
          author: pr.user?.login ?? null,
        };
        return lifecycle;
      }),
    );
    lifecycles.forEach((r) => {
      if (r.status === 'fulfilled') results.push(r.value);
    });
  }

  return results;
}

/**
 * Build a map from proposal filename → most-recent merged PR lifecycle.
 * Used for proposals that landed in main.
 */
export function buildFilenameLifecycleMap(lifecycles: PRLifecycle[]): Map<string, PRLifecycle> {
  const map = new Map<string, PRLifecycle>();
  // Only consider merged PRs so we don't pollute approved proposals with stale open-PR data
  const merged = lifecycles.filter((lc) => lc.pr_merged);
  const sorted = [...merged].sort((a, b) => b.pr_number - a.pr_number);
  for (const lc of sorted) {
    for (const file of lc.proposal_files) {
      if (!map.has(file)) map.set(file, lc);
    }
  }
  return map;
}

/**
 * Returns lifecycles for proposal PRs that aren't owned by the ledger.
 * Filter: PR must touch at least one .md file in /proposals/.
 *
 * Includes merged PRs too — some PRs are approved on Board #3 (and so should
 * show as approved on the dashboard) but never made it into the YAML ledger.
 * Downstream sync filters this set against Board #3 membership and drops any
 * PR already in the ledger, so merged PRs that ARE in the ledger don't
 * double-count.
 */
export function getPipelineLifecycles(lifecycles: PRLifecycle[]): PRLifecycle[] {
  return lifecycles.filter((lc) => lc.proposal_files.length > 0);
}
