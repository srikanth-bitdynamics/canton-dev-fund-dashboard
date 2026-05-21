// GitHub Project Board v2 GraphQL integration.
//
// Project #3 ("Dev Fund Incoming") — authoritative proposal lifecycle (status column)
// Project #5 ("Dev Fund Milestones") — authoritative milestone delivery + CC amounts
//
// REQUIRES `read:project` scope on the GitHub token. Without it, queries return
// INSUFFICIENT_SCOPES; the caller falls back to label-derived status.

import { getOctokit, REPO_OWNER } from './client';
import type { MilestoneStatus, ProposalStatus } from '@/lib/types';

const BOARD_QUERY = (projectNumber: number, cursor: string | null) => `
  query {
    organization(login: "${REPO_OWNER}") {
      projectV2(number: ${projectNumber}) {
        items(first: 100${cursor ? `, after: "${cursor}"` : ''}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            fieldValues(first: 30) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2SingleSelectField { name } }
                }
                ... on ProjectV2ItemFieldNumberValue {
                  number
                  field { ... on ProjectV2FieldCommon { name } }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2FieldCommon { name } }
                }
                ... on ProjectV2ItemFieldDateValue {
                  date
                  field { ... on ProjectV2FieldCommon { name } }
                }
              }
            }
            content {
              __typename
              ... on PullRequest {
                number
                title
                labels(first: 20) { nodes { name } }
              }
              ... on Issue {
                number
                title
                state
                closedAt
                labels(first: 20) { nodes { name } }
              }
              ... on DraftIssue { title }
            }
          }
        }
      }
    }
  }
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllBoardItems(projectNumber: number): Promise<any[]> {
  const octokit = getOctokit();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  let cursor: string | null = null;
  // Safety: cap at 10 pages = 1000 items
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await octokit.graphql(BOARD_QUERY(projectNumber, cursor));
    const page = data?.organization?.projectV2?.items;
    if (!page) break;
    nodes.push(...(page.nodes ?? []));
    if (!page.pageInfo?.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return nodes;
}

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
  voting: 'voting',
  approved: 'approved',
  'needs revision': 'tech-review',
  declined: 'declined',
  rejected: 'declined',
};

const BOARD_5_STATUS_MAP: Record<string, MilestoneStatus> = {
  'backlog': 'planned',
  'in progress': 'in-progress',
  'ready for evidence': 'in-progress',
  'ready for milestone review': 'in-review',
  'payment under way': 'in-review',     // payment authorized, awaiting on-chain release
  'payment underway': 'in-review',       // same, no-space variant
  'milestone approved': 'delivered',
  'payment released': 'delivered',
  done: 'delivered',
};

export interface BoardItem {
  content_type: 'pr' | 'issue' | 'draft' | 'unknown';
  pr_number: number | null;
  issue_number: number | null;
  issue_state: 'open' | 'closed' | null;
  issue_closed_at: string | null;
  title: string;
  labels: string[];
  board_status: string | null; // raw column name
  estimate_cc: number | null;   // numeric field value (Estimate / Amount / CC)
}

export interface Board3Item extends BoardItem {
  derived_status: ProposalStatus | null;
}

export interface Board5Item extends BoardItem {
  derived_status: MilestoneStatus | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractItems(nodes: any[]): BoardItem[] {
  const items: BoardItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const node of nodes as any[]) {
    if (!node?.content) continue;
    const c = node.content;
    let pr_number: number | null = null;
    let issue_number: number | null = null;
    let issue_state: 'open' | 'closed' | null = null;
    let issue_closed_at: string | null = null;
    let content_type: BoardItem['content_type'] = 'unknown';
    if (c.__typename === 'PullRequest') {
      content_type = 'pr';
      pr_number = c.number;
    } else if (c.__typename === 'Issue') {
      content_type = 'issue';
      issue_number = c.number;
      issue_state = c.state?.toLowerCase() === 'closed' ? 'closed' : 'open';
      issue_closed_at = c.closedAt || null;
    } else if (c.__typename === 'DraftIssue') {
      content_type = 'draft';
    }
    const labels: string[] = ((c.labels?.nodes ?? []) as { name: string }[])
      .map((l) => l.name)
      .filter(Boolean);

    let board_status: string | null = null;
    let estimate_cc: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const fv of (node.fieldValues?.nodes ?? []) as any[]) {
      const fieldName = fv?.field?.name as string | undefined;
      if (!fieldName) continue;
      if (fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && /^status$/i.test(fieldName)) {
        board_status = fv.name ?? null;
      } else if (fv.__typename === 'ProjectV2ItemFieldNumberValue' &&
        /^(estimate|amount|cc|funding|budget)$/i.test(fieldName)) {
        if (typeof fv.number === 'number' && fv.number > 0) {
          estimate_cc = Math.round(fv.number);
        }
      }
    }
    items.push({
      content_type,
      pr_number,
      issue_number,
      issue_state,
      issue_closed_at,
      title: c.title ?? '',
      labels,
      board_status,
      estimate_cc,
    });
  }
  return items;
}

/** Fetch Project Board #3 (proposal lifecycle). Returns null on scope error. */
export async function fetchBoard3(): Promise<Board3Item[] | null> {
  try {
    const nodes = await fetchAllBoardItems(3);
    return extractItems(nodes).map((item) => ({
      ...item,
      derived_status:
        item.board_status && BOARD_3_STATUS_MAP[item.board_status.toLowerCase().trim()]
          ? BOARD_3_STATUS_MAP[item.board_status.toLowerCase().trim()]
          : null,
    }));
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('INSUFFICIENT_SCOPES') || msg.includes('read:project')) {
      console.warn('Board #3 query skipped — read:project scope not on GITHUB_TOKEN');
      return null;
    }
    console.error('Board #3 fetch error:', e);
    return null;
  }
}

/** Fetch Project Board #5 (milestone delivery + Estimate field). Returns null on scope error. */
export async function fetchBoard5(): Promise<Board5Item[] | null> {
  try {
    const nodes = await fetchAllBoardItems(5);
    return extractItems(nodes).map((item) => ({
      ...item,
      derived_status:
        item.board_status && BOARD_5_STATUS_MAP[item.board_status.toLowerCase().trim()]
          ? BOARD_5_STATUS_MAP[item.board_status.toLowerCase().trim()]
          : null,
    }));
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('INSUFFICIENT_SCOPES') || msg.includes('read:project')) {
      console.warn('Board #5 query skipped — read:project scope not on GITHUB_TOKEN');
      return null;
    }
    console.error('Board #5 fetch error:', e);
    return null;
  }
}

/** PR number → Board #3 status (for proposal lifecycle). */
export function buildBoard3StatusMap(items: Board3Item[]): Map<number, { status: ProposalStatus; raw: string }> {
  const map = new Map<number, { status: ProposalStatus; raw: string }>();
  for (const item of items) {
    if (item.pr_number && item.derived_status) {
      map.set(item.pr_number, { status: item.derived_status, raw: item.board_status || '' });
    }
  }
  return map;
}

export interface Board5MilestoneInfo {
  issue_number: number;
  title: string;
  status: MilestoneStatus;
  board_status: string;          // raw column name e.g. "Payment under way"
  estimate_cc: number | null;
  closed_at: string | null;
}

/** All Board #5 items that represent milestones (have an underlying issue). */
export function getBoard5Milestones(items: Board5Item[]): Board5MilestoneInfo[] {
  return items
    .filter((item) => item.issue_number !== null && item.derived_status !== null)
    .map((item) => ({
      issue_number: item.issue_number!,
      title: item.title,
      status: item.derived_status!,
      board_status: item.board_status || '',
      estimate_cc: item.estimate_cc,
      closed_at: item.issue_closed_at,
    }));
}
