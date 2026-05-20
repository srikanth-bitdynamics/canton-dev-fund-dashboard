import { getOctokit, REPO_NAME, REPO_OWNER } from './client';

export interface RawProposalFile {
  filename: string;
  content: string;
  sha: string;
  html_url: string;
}

export interface ProposalPR {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  created_at: string;
  labels: string[];
  author: string | null;
  files: string[]; // proposal files touched
}

/**
 * Lists all .md files in /proposals (excludes images, the template, and the README).
 */
export async function listProposalFiles(): Promise<{ filename: string; sha: string }[]> {
  const octokit = getOctokit();
  const res = await octokit.repos.getContent({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: 'proposals',
  });
  if (!Array.isArray(res.data)) {
    throw new Error('proposals path did not return a directory listing');
  }
  return res.data
    .filter((f) => f.type === 'file' && f.name.endsWith('.md') && f.name !== '_template.md')
    .map((f) => ({ filename: f.name, sha: f.sha }));
}

/**
 * Fetches and base64-decodes a single proposal markdown file.
 */
export async function fetchProposalFile(filename: string): Promise<RawProposalFile> {
  const octokit = getOctokit();
  const res = await octokit.repos.getContent({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: `proposals/${filename}`,
  });
  if (Array.isArray(res.data) || res.data.type !== 'file') {
    throw new Error(`${filename} did not return a file`);
  }
  const data = res.data as { content?: string; sha: string; html_url: string };
  const b64 = data.content || '';
  const content = Buffer.from(b64, 'base64').toString('utf-8');
  return {
    filename,
    content,
    sha: data.sha,
    html_url: data.html_url,
  };
}

/**
 * Fetches all PRs (open and closed) to extract proposal lifecycle data.
 * Maps each PR to the proposal file it touched (if any).
 */
export async function listProposalPRs(): Promise<ProposalPR[]> {
  const octokit = getOctokit();
  const prs = await octokit.paginate(octokit.pulls.list, {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    state: 'all',
    per_page: 100,
  });

  // For each PR, fetch files to find which proposal it touches
  const results: ProposalPR[] = [];
  for (const pr of prs) {
    try {
      const filesRes = await octokit.pulls.listFiles({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        pull_number: pr.number,
        per_page: 100,
      });
      const proposalFiles = filesRes.data
        .filter((f) => f.filename.startsWith('proposals/') && f.filename.endsWith('.md'))
        .map((f) => f.filename.replace('proposals/', ''));
      results.push({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        merged_at: pr.merged_at,
        created_at: pr.created_at,
        labels: pr.labels.map((l) => l.name),
        author: pr.user?.login ?? null,
        files: proposalFiles,
      });
    } catch (e) {
      // Skip PRs we can't read (e.g., from deleted branches)
      console.warn(`Skipping PR #${pr.number}: ${(e as Error).message}`);
    }
  }
  return results;
}
