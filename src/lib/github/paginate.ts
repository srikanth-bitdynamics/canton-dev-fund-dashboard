// Helper to wrap Octokit pagination with type safety.
import type { Octokit } from '@octokit/rest';

export interface PullsListItem {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  created_at: string;
  labels: { name: string }[];
  user: { login: string } | null;
}

interface PullsListParams {
  owner: string;
  repo: string;
  state: 'open' | 'closed' | 'all';
  per_page: number;
}

export function paginatePulls(client: Octokit, params: PullsListParams): Promise<PullsListItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client.paginate(client.pulls.list, params as any) as Promise<PullsListItem[]>;
}
