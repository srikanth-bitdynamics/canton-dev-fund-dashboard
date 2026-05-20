import { NextResponse } from 'next/server';
import { fetchProposalFile, listProposalFiles } from '@/lib/github/proposals';
import { parseProposal, type ParsedProposal } from '@/lib/parser/proposal-parser';
import {
  buildFilenameLifecycleMap,
  fetchAllPRLifecycles,
  getPipelineLifecycles,
  type PRLifecycle,
} from '@/lib/github/lifecycle';

interface EnrichedProposal extends ParsedProposal {
  pr_number: number | null;
  pr_state: 'open' | 'closed' | null;
  pr_merged: boolean;
  derived_status: string | null;
  labels: string[];
  github_author: string | null;
  in_repo: boolean;
}

let _cache: { data: EnrichedProposal[]; ts: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1';

  if (!refresh && _cache && Date.now() - _cache.ts < TTL_MS) {
    return NextResponse.json({ proposals: _cache.data, cached: true, count: _cache.data.length });
  }

  try {
    const [files, lifecycles] = await Promise.all([
      listProposalFiles(),
      fetchAllPRLifecycles().catch((e) => {
        console.warn('PR lifecycle fetch failed:', (e as Error).message);
        return [] as PRLifecycle[];
      }),
    ]);

    const lifecycleMap = buildFilenameLifecycleMap(lifecycles);
    const proposals: EnrichedProposal[] = [];
    const errors: { filename: string; error: string }[] = [];

    // Pass 1: proposals that landed in main (full parse from markdown)
    const BATCH = 5;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async ({ filename }) => {
          const raw = await fetchProposalFile(filename);
          const parsed = parseProposal(filename, raw.content);
          const lc = lifecycleMap.get(filename);
          const enriched: EnrichedProposal = {
            ...parsed,
            pr_number: lc?.pr_number ?? null,
            pr_state: lc?.pr_state ?? null,
            pr_merged: lc?.pr_merged ?? false,
            derived_status: lc?.derived_status ?? 'approved',
            labels: lc?.labels ?? [],
            github_author: lc?.author ?? null,
            in_repo: true,
          };
          return enriched;
        }),
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') proposals.push(r.value);
        else errors.push({ filename: batch[idx].filename, error: String(r.reason) });
      });
    }

    // Pass 2: pipeline proposals — open + closed-unmerged PRs that propose new files
    // Lightweight: skeleton data from the PR (title, author, labels) — no markdown parse.
    const pipeline = getPipelineLifecycles(lifecycles);
    const inRepoFiles = new Set(files.map((f) => f.filename));
    for (const lc of pipeline) {
      // Skip if this PR's file already landed (avoid duplicates)
      if (lc.proposal_files.some((f) => inRepoFiles.has(f))) continue;
      // Use the first proposal file as the pseudo-filename
      const pseudoFilename = lc.proposal_files[0] || `pr-${lc.pr_number}.md`;
      // Skip if we already added this pseudo-filename
      if (proposals.some((p) => p.filename === pseudoFilename)) continue;
      const titleClean = lc.pr_title.replace(/^Proposal:\s*/i, '').trim();
      proposals.push({
        filename: pseudoFilename,
        title: titleClean || pseudoFilename.replace('.md', ''),
        author: lc.author,
        author_email: null,
        status: null,
        created: lc.pr_created_at.split('T')[0],
        updated: null,
        champion: null,
        category: null,
        website: null,
        twitter: null,
        total_funding_cc: 0,
        milestones: [],
        raw_metadata: {},
        parse_warnings: ['Pipeline-only (no markdown in main)'],
        pr_number: lc.pr_number,
        pr_state: lc.pr_state,
        pr_merged: false,
        derived_status: lc.derived_status,
        labels: lc.labels,
        github_author: lc.author,
        in_repo: false,
      });
    }

    _cache = { data: proposals, ts: Date.now() };
    return NextResponse.json({
      proposals,
      cached: false,
      count: proposals.length,
      pr_count: lifecycles.length,
      pipeline_count: pipeline.length,
      in_repo_count: files.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
