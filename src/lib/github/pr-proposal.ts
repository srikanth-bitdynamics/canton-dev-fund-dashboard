// Fetch the proposed markdown file from an open PR's head ref + parse its funding.
//
// Used for voting-stage proposals (open PRs not yet merged into main) so the
// dashboard can show the total CC ask for this week's voting batch.

import { getOctokit, REPO_OWNER, REPO_NAME } from './client';
import { parseProposal } from '@/lib/parser/proposal-parser';

interface PrFile {
  filename: string;
  status: string;
  // raw content (we fetch separately via Contents API on the head ref)
}

export interface PrProposalParse {
  pr_number: number;
  filename: string;
  title: string;
  total_funding_cc: number;
  milestone_count: number;
}

/**
 * For a given PR, find the proposal .md file it adds/modifies, fetch it from
 * the PR's head ref, and parse the funding. Returns null if the PR doesn't
 * touch a proposal file, or if parsing fails.
 */
export async function fetchPrProposalFunding(pr_number: number): Promise<PrProposalParse | null> {
  const octokit = getOctokit();
  try {
    // Get PR's head ref
    const pr = await octokit.pulls.get({ owner: REPO_OWNER, repo: REPO_NAME, pull_number: pr_number });
    const headSha = pr.data.head.sha;
    const headOwner = pr.data.head.repo?.owner?.login || REPO_OWNER;
    const headRepo = pr.data.head.repo?.name || REPO_NAME;

    // List PR files
    const filesRes = await octokit.pulls.listFiles({
      owner: REPO_OWNER, repo: REPO_NAME, pull_number: pr_number, per_page: 100,
    });
    const proposalFile = (filesRes.data as PrFile[]).find(
      (f) => f.filename.startsWith('proposals/') && f.filename.endsWith('.md'),
    );
    if (!proposalFile) return null;

    // Fetch the file content from the PR's head ref
    const fileRes = await octokit.repos.getContent({
      owner: headOwner,
      repo: headRepo,
      path: proposalFile.filename,
      ref: headSha,
    });
    if (Array.isArray(fileRes.data) || (fileRes.data as { type?: string }).type !== 'file') return null;
    const data = fileRes.data as { content?: string };
    const content = Buffer.from(data.content || '', 'base64').toString('utf-8');
    const parsed = parseProposal(proposalFile.filename, content);
    return {
      pr_number,
      filename: proposalFile.filename,
      title: parsed.title,
      total_funding_cc: parsed.total_funding_cc,
      milestone_count: parsed.milestones.length,
    };
  } catch (e) {
    console.warn(`Failed to fetch funding for PR #${pr_number}:`, (e as Error).message);
    return null;
  }
}

/** Fetch funding data for a list of PRs in parallel (small batches). */
export async function fetchPrProposalFundings(prNumbers: number[]): Promise<Map<number, PrProposalParse>> {
  const result = new Map<number, PrProposalParse>();
  const BATCH = 4;
  for (let i = 0; i < prNumbers.length; i += BATCH) {
    const batch = prNumbers.slice(i, i + BATCH);
    const parsed = await Promise.all(batch.map((pr) => fetchPrProposalFunding(pr)));
    parsed.forEach((p, idx) => {
      if (p) result.set(batch[idx], p);
    });
  }
  return result;
}
