// Match GitHub milestone issues to our DB milestones.
//
// Canton's workflow creates one GitHub issue per approved milestone with a title
// like "<Proposal Title> #<PR number> Milestone <N>: <Milestone Title>".
// When the issue is CLOSED → the milestone is delivered.
//
// This gives us "real delivered" data with just `repo` scope.
// Project Board #5 GraphQL adds richer status (Payment Released, etc.) when
// `read:project` is granted — handled separately in project-boards.ts.

import { paginatePulls } from './paginate';
import { getOctokit, REPO_NAME, REPO_OWNER } from './client';

export interface MilestoneIssue {
  issue_number: number;
  state: 'open' | 'closed';
  closed_at: string | null;
  pr_number: number | null;       // parent proposal PR (from "#NNN" in title)
  milestone_number: number | null; // from "Milestone N" in title
  title: string;
  body: string;
  cc_from_body: number | null;     // parsed from body "X,XXX,XXX CC"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function paginateIssues(client: any, params: Record<string, unknown>): Promise<unknown[]> {
  return client.paginate(client.issues.listForRepo, params);
}

/**
 * Fetch all milestone-titled issues from the canton-dev-fund repo.
 * Issue titles match `Milestone N` and (optionally) contain `#<PR>` reference.
 */
export async function fetchMilestoneIssues(): Promise<MilestoneIssue[]> {
  const octokit = getOctokit();
  // Note: octokit issues.listForRepo also returns PRs by default; filter them out
  const raw = await paginateIssues(octokit, {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    state: 'all',
    per_page: 100,
  });

  const results: MilestoneIssue[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of raw as any[]) {
    if (it.pull_request) continue; // skip PRs (this endpoint includes both)
    const title: string = it.title || '';
    const milestoneMatch = title.match(/Milestone\s+(\d+)/i);
    if (!milestoneMatch) continue;
    // PR number can appear in several forms:
    //   "Foo #123 Milestone 1"     — hash prefix
    //   "Foo 123 Milestone 1"      — bare number (LSU style)
    //   "Foo 123 - Milestone 1"    — dash separator (Token Std V2 style)
    const prMatch =
      title.match(/#(\d+)/) ||
      title.match(/(?:^|\s)(\d{2,4})[\s\-–—]+Milestone/i);
    const body: string = it.body || '';
    // Parse CC amount from body: prefer "X,XXX,XXX CC" patterns near "Compensation" or "Funding"
    let cc: number | null = null;
    const ccMatch = body.match(/([\d,]+)\s*CC\b/);
    if (ccMatch) {
      const n = parseInt(ccMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(n) && n >= 1000) cc = n;
    }
    results.push({
      issue_number: it.number,
      state: it.state as 'open' | 'closed',
      closed_at: it.closed_at,
      pr_number: prMatch ? parseInt(prMatch[1], 10) : null,
      milestone_number: parseInt(milestoneMatch[1], 10),
      title,
      body,
      cc_from_body: cc,
    });
  }
  return results;
}

/**
 * Build a lookup: (PR_number, milestone_number) → MilestoneIssue.
 * Used to match our DB milestones to live GitHub issues.
 */
export function buildMilestoneIssueIndex(
  issues: MilestoneIssue[],
): Map<string, MilestoneIssue> {
  const map = new Map<string, MilestoneIssue>();
  for (const issue of issues) {
    if (issue.pr_number !== null && issue.milestone_number !== null) {
      map.set(`${issue.pr_number}:${issue.milestone_number}`, issue);
    }
  }
  return map;
}

/**
 * Title-similarity fallback: when an issue's `#PR` reference is wrong/missing,
 * find a proposal whose title appears in the issue title.
 * Used as a secondary lookup.
 */
export function findIssueByTitleSimilarity(
  issues: MilestoneIssue[],
  proposalTitle: string,
  milestoneNumber: number,
): MilestoneIssue | undefined {
  const proposalWords = proposalTitle
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4); // ignore short words
  if (proposalWords.length === 0) return undefined;

  for (const issue of issues) {
    if (issue.milestone_number !== milestoneNumber) continue;
    const issueTitle = issue.title.toLowerCase();
    // Count how many distinctive words from the proposal appear in the issue title
    const overlap = proposalWords.filter((w) => issueTitle.includes(w)).length;
    // Heuristic: ≥ 3 distinctive words shared, OR ≥ 60% of the proposal's words present
    if (overlap >= 3 || overlap / proposalWords.length >= 0.6) {
      return issue;
    }
  }
  return undefined;
}
// Keep linter happy
void paginatePulls;
