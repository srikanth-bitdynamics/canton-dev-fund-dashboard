// GitHub Project Board v2 GraphQL integration.
//
// Project #3 ("Dev Fund Incoming") — authoritative proposal lifecycle (status column)
// Project #5 ("Dev Fund Milestones") — authoritative milestone delivery + CC amounts
//
// REQUIRES `read:project` scope on the GitHub token. Without it, these queries return
// INSUFFICIENT_SCOPES error. Sync handler catches it and falls back to label-derived
// status from src/lib/github/lifecycle.ts.

import { getOctokit, REPO_OWNER } from './client';
import type { ProposalStatus } from '@/lib/types';

interface ProjectV2ItemRaw {
  status: string | null;
  pr_number: number | null;
  issue_number: number | null;
  title: string;
}

const BOARD_QUERY = (projectNumber: number) => `
  query {
    organization(login: "${REPO_OWNER}") {
      projectV2(number: ${projectNumber}) {
        items(first: 200) {
          nodes {
            fieldValues(first: 20) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2SingleSelectField { name }
                  }
                }
              }
            }
            content {
              ... on PullRequest {
                number
                title
              }
              ... on Issue {
                number
                title
              }
            }
          }
        }
      }
    }
  }
`;

/** Map Project Board #3 column names to dashboard ProposalStatus. */
const BOARD_3_STATUS_MAP: Record<string, ProposalStatus> = {
  'incoming': 'submitted',
  'needs champion': 'submitted',
  'in review': 'tech-review',
  'in review (champion assigned)': 'tech-review',
  'champion assigned': 'champion-review',
  'needs review by core contributors': 'tech-review',
  'needs review by core contributors/security': 'tech-review',
  'ready for vote': 'voting',
  'voting live': 'voting',
  'voting': 'voting',
  'approved': 'approved',
  'needs revision': 'tech-review',
  'declined': 'declined',
  'rejected': 'declined',
};

export interface BoardItem {
  pr_number: number | null;
  issue_number: number | null;
  title: string;
  board_status: string | null; // raw column name
  derived_status: ProposalStatus | null;
}

/**
 * Fetch all items from Project Board #3 (proposal lifecycle).
 * Returns null on scope error so the caller can fall back to label-derived status.
 */
export async function fetchBoard3(): Promise<BoardItem[] | null> {
  try {
    const octokit = getOctokit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await octokit.graphql(BOARD_QUERY(3));
    return extractBoardItems(data, BOARD_3_STATUS_MAP);
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('INSUFFICIENT_SCOPES') || msg.includes('read:project')) {
      console.warn('Project Board #3 query skipped — read:project scope not granted on GITHUB_TOKEN');
      return null;
    }
    console.error('Project Board #3 fetch error:', e);
    return null;
  }
}

/**
 * Fetch all items from Project Board #5 (milestone delivery).
 * Returns null on scope error.
 */
export async function fetchBoard5(): Promise<BoardItem[] | null> {
  try {
    const octokit = getOctokit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await octokit.graphql(BOARD_QUERY(5));
    return extractBoardItems(data, {});
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('INSUFFICIENT_SCOPES') || msg.includes('read:project')) {
      console.warn('Project Board #5 query skipped — read:project scope not granted on GITHUB_TOKEN');
      return null;
    }
    console.error('Project Board #5 fetch error:', e);
    return null;
  }
}

function extractBoardItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  statusMap: Record<string, ProposalStatus>,
): BoardItem[] {
  const nodes = data?.organization?.projectV2?.items?.nodes ?? [];
  const items: BoardItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const node of nodes as any[]) {
    if (!node?.content) continue;
    const pr_number = typeof node.content.number === 'number' && 'title' in node.content ? node.content.number : null;
    const title = node.content.title || '';
    // Find a field value whose field name is "Status" (case-insensitive)
    let board_status: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const fv of (node.fieldValues?.nodes ?? []) as any[]) {
      if (fv?.field?.name && /^status$/i.test(fv.field.name)) {
        board_status = fv.name || null;
        break;
      }
    }
    const derived_status = board_status && statusMap[board_status.toLowerCase().trim()]
      ? statusMap[board_status.toLowerCase().trim()]
      : null;
    items.push({
      pr_number,
      issue_number: null,
      title,
      board_status,
      derived_status,
    });
  }
  return items;
}

/** Build a map from PR number → board_status for proposals on Board #3. */
export function buildBoard3StatusMap(items: BoardItem[]): Map<number, { status: ProposalStatus; raw: string }> {
  const map = new Map<number, { status: ProposalStatus; raw: string }>();
  for (const item of items) {
    if (item.pr_number && item.derived_status) {
      map.set(item.pr_number, { status: item.derived_status, raw: item.board_status || '' });
    }
  }
  return map;
}
