// Fetch + parse the "Approved Projects Ledger" GitHub issue.
//
// This is the SOURCE OF TRUTH for approved projects, their milestones,
// budgets, and payment status. The issue body contains a YAML block under
// "## Current ledger" with the canonical data.
//
// Repo + issue number configurable via env (defaults shown).

import { Octokit } from '@octokit/rest';
import { parse as parseYaml } from 'yaml';

const LEDGER_OWNER = process.env.LEDGER_OWNER || 'srikanth-bitdynamics';
const LEDGER_REPO = process.env.LEDGER_REPO || 'canton-dev-fund-dashboard';
const LEDGER_ISSUE = Number(process.env.LEDGER_ISSUE) || 1;

export interface LedgerMilestone {
  n: number;
  title: string;
  amount_cc: number;
  due_date?: string;
  status: 'planned' | 'in_progress' | 'delivered';
  released_date?: string;
  tx?: string;
  evidence?: string;
}

export interface LedgerProject {
  id: string;                  // CDF-NNN
  pr: number;
  title: string;
  applicant: string;
  champion?: string;
  category?: 'protocol' | 'devtools' | 'security' | 'reference' | 'infra' | 'defi';
  approved_date?: string;
  quarter?: string;
  total_cc: number;
  duration_months?: number;
  milestones: LedgerMilestone[];
}

export interface LedgerData {
  projects: LedgerProject[];
}

export interface LedgerFetchResult {
  data: LedgerData;
  issue_url: string;
  fetched_at: string;
}

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var not set');
  return new Octokit({ auth: token });
}

/**
 * Fetch the ledger issue and parse the YAML block inside it.
 * Returns null if the issue is missing or the YAML block can't be parsed.
 */
export async function fetchLedger(): Promise<LedgerFetchResult | null> {
  const octokit = getOctokit();
  try {
    const res = await octokit.issues.get({
      owner: LEDGER_OWNER,
      repo: LEDGER_REPO,
      issue_number: LEDGER_ISSUE,
    });
    const body = res.data.body || '';
    const data = parseLedgerBody(body);
    if (!data) return null;
    return {
      data,
      issue_url: res.data.html_url,
      fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Ledger fetch failed:', (e as Error).message);
    return null;
  }
}

/** Extract the YAML block under "Current ledger" or the LAST fenced yaml block. */
export function parseLedgerBody(body: string): LedgerData | null {
  // Find a ```yaml ... ``` fence. There may be a schema block first, then the ledger block.
  // We want the LAST yaml block (the actual data).
  const blocks = [...body.matchAll(/```ya?ml\s*\n([\s\S]*?)```/gi)];
  if (blocks.length === 0) return null;
  const lastBlock = blocks[blocks.length - 1][1];
  try {
    const parsed = parseYaml(lastBlock);
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    // Validate + normalize
    const projects: LedgerProject[] = [];
    for (const raw of parsed.projects) {
      if (!raw || typeof raw !== 'object') continue;
      if (typeof raw.id !== 'string' || typeof raw.title !== 'string') continue;
      const milestones: LedgerMilestone[] = Array.isArray(raw.milestones)
        ? raw.milestones
            .filter((m: unknown) => !!m && typeof m === 'object')
            .map((m: Partial<LedgerMilestone>): LedgerMilestone => ({
              n: Number(m.n) || 0,
              title: String(m.title || ''),
              amount_cc: Number(m.amount_cc) || 0,
              due_date: m.due_date,
              status: (m.status as LedgerMilestone['status']) || 'planned',
              released_date: m.released_date,
              tx: m.tx,
              evidence: m.evidence,
            }))
            .filter((m: LedgerMilestone) => m.n > 0)
        : [];
      projects.push({
        id: raw.id,
        pr: Number(raw.pr) || 0,
        title: raw.title,
        applicant: String(raw.applicant || 'Unknown'),
        champion: raw.champion || undefined,
        category: raw.category,
        approved_date: raw.approved_date,
        quarter: raw.quarter,
        total_cc: Number(raw.total_cc) || 0,
        duration_months: raw.duration_months,
        milestones,
      });
    }
    return { projects };
  } catch (e) {
    console.error('Ledger YAML parse failed:', (e as Error).message);
    return null;
  }
}
