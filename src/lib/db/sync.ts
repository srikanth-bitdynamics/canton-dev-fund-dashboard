import crypto from 'crypto';
import { db, schema } from './client';
import { eq } from 'drizzle-orm';
import { fetchProposalFile, listProposalFiles } from '@/lib/github/proposals';
import { parseProposal } from '@/lib/parser/proposal-parser';
import {
  buildFilenameLifecycleMap,
  fetchAllPRLifecycles,
  getPipelineLifecycles,
} from '@/lib/github/lifecycle';

export interface SyncResult {
  sync_id: string;
  proposals_synced: number;
  milestones_synced: number;
  pipeline_synced: number;
  unchanged: number;
  errors: { filename: string; error: string }[];
  duration_ms: number;
}

const SIG_TO_CAT: Record<string, string> = {
  'canton-protocol-multi-synchronizer': 'protocol',
  'canton-apis': 'protocol',
  'global-synchronizer-scaling': 'protocol',
  'daml-tooling': 'devtools',
  'dar-app-management': 'devtools',
  'dapp-integration': 'devtools',
  'wallet-apps': 'devtools',
  'token-asset-standards': 'reference',
  'attestor-pools-daos-multisig': 'reference',
  'financial-workflows-composability': 'reference',
  'regulatory-compliance': 'security',
  'node-deployment-operations': 'infra',
  'party-portability-data-resilience': 'infra',
  tokenomics: 'defi',
  'defi-liquidity': 'defi',
  'onchain-governance': 'protocol',
};

function categoryFromLabels(labels: string[]): string | null {
  for (const label of labels) {
    if (SIG_TO_CAT[label]) return SIG_TO_CAT[label];
  }
  return null;
}

function deriveQuarter(createdISO: string | null): string {
  if (!createdISO) return '2026-Q2';
  const d = new Date(createdISO);
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function genId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Full sync from GitHub → DB. Upsert pattern using raw_content_hash for change detection. */
export async function syncProposals(): Promise<SyncResult> {
  const start = Date.now();
  const sync_id = genId('sync');

  // Log sync start
  db.insert(schema.sync_log).values({
    id: sync_id,
    sync_type: 'full_sync',
    source: 'proposals+prs',
    status: 'started',
  }).run();

  let proposals_synced = 0;
  let milestones_synced = 0;
  let pipeline_synced = 0;
  let unchanged = 0;
  const errors: { filename: string; error: string }[] = [];

  try {
    // Fetch files + lifecycles in parallel
    const [files, lifecycles] = await Promise.all([
      listProposalFiles(),
      fetchAllPRLifecycles().catch(() => []),
    ]);
    const lifecycleMap = buildFilenameLifecycleMap(lifecycles);
    const pipeline = getPipelineLifecycles(lifecycles);
    const inRepoFiles = new Set(files.map((f) => f.filename));

    // Pass 1: in-repo proposals (full markdown parse)
    let idx = 0;
    const BATCH = 5;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async ({ filename }) => {
          const raw = await fetchProposalFile(filename);
          const content_hash = sha256(raw.content);

          // Check if unchanged
          const existing = db
            .select()
            .from(schema.proposals)
            .where(eq(schema.proposals.filename, filename))
            .get();

          if (existing && existing.raw_content_hash === content_hash) {
            return { type: 'unchanged' as const };
          }

          const parsed = parseProposal(filename, raw.content);
          const lc = lifecycleMap.get(filename);
          const labels = lc?.labels ?? [];
          const id = existing?.id || `CDF-${String(++idx).padStart(3, '0')}`;

          // Parse admin overrides — these fields are NOT overwritten by sync
          const overrides: string[] = existing?.overrides ? JSON.parse(existing.overrides) : [];
          const milestonesLocked = !!existing?.milestones_locked;
          const o = new Set(overrides);

          // Compute incoming values
          const incoming = {
            title: parsed.title,
            author: parsed.author,
            author_email: parsed.author_email,
            champion: parsed.champion,
            category: categoryFromLabels(labels) || parsed.category,
            raw_category: parsed.category,
            status: lc?.derived_status || 'approved',
            total_funding_cc: parsed.total_funding_cc,
            quarter: deriveQuarter(parsed.created),
            website: parsed.website,
            twitter: parsed.twitter,
          };

          // Merge with existing — admin overrides win
          const merged = {
            title: o.has('title') ? existing!.title : incoming.title,
            author: o.has('author') ? existing!.author : incoming.author,
            author_email: o.has('author_email') ? existing!.author_email : incoming.author_email,
            champion: o.has('champion') ? existing!.champion : incoming.champion,
            category: o.has('category') ? existing!.category : incoming.category,
            raw_category: incoming.raw_category, // raw_category is never overridden — it's the GitHub source
            status: o.has('status') ? existing!.status : incoming.status,
            total_funding_cc: o.has('total_funding_cc') ? existing!.total_funding_cc : incoming.total_funding_cc,
            quarter: o.has('quarter') ? existing!.quarter : incoming.quarter,
            website: o.has('website') ? existing!.website : incoming.website,
            twitter: o.has('twitter') ? existing!.twitter : incoming.twitter,
          };

          // Upsert proposal
          db.insert(schema.proposals)
            .values({
              id,
              filename,
              github_pr_number: lc?.pr_number ?? null,
              pr_state: lc?.pr_state ?? null,
              pr_merged: lc?.pr_merged ?? true,
              in_repo: true,
              title: merged.title,
              author: merged.author,
              author_email: merged.author_email,
              github_author: lc?.author ?? null,
              champion: merged.champion,
              status: merged.status,
              category: merged.category,
              raw_category: merged.raw_category,
              labels: JSON.stringify(labels),
              total_funding_cc: merged.total_funding_cc,
              created_date: parsed.created,
              updated_date: parsed.updated,
              quarter: merged.quarter,
              website: merged.website,
              twitter: merged.twitter,
              raw_content_hash: content_hash,
              parse_warnings: JSON.stringify(parsed.parse_warnings),
              updated_at: new Date().toISOString(),
              synced_at: new Date().toISOString(),
            })
            .onConflictDoUpdate({
              target: schema.proposals.filename,
              set: {
                title: merged.title,
                author: merged.author,
                status: merged.status,
                category: merged.category,
                labels: JSON.stringify(labels),
                total_funding_cc: merged.total_funding_cc,
                pr_number: lc?.pr_number ?? null,
                raw_content_hash: content_hash,
                updated_at: new Date().toISOString(),
                synced_at: new Date().toISOString(),
              } as Record<string, unknown>,
            })
            .run();

          // Respect milestones_locked — admin marked this set as authoritative
          if (milestonesLocked) {
            return { type: 'synced' as const, milestones_locked: true };
          }

          // Replace milestones (simpler than diffing)
          db.delete(schema.milestones).where(eq(schema.milestones.proposal_id, id)).run();
          for (const m of parsed.milestones) {
            const mid = `${id}-M${m.number}`;
            db.insert(schema.milestones).values({
              id: mid,
              proposal_id: id,
              milestone_number: m.number,
              title: m.title,
              funding_cc: m.funding_cc,
              estimated_delivery: m.estimated_delivery,
              focus: m.focus,
              acceptance: m.acceptance,
              status: merged.status === 'approved' ? (m.number === 1 ? 'delivered' : 'planned') : 'planned',
            }).run();
            milestones_synced++;
          }

          return { type: 'synced' as const };
        }),
      );
      results.forEach((r, j) => {
        if (r.status === 'fulfilled') {
          if (r.value.type === 'unchanged') unchanged++;
          else proposals_synced++;
        } else {
          errors.push({ filename: batch[j].filename, error: String(r.reason) });
        }
      });
    }

    // Pass 2: pipeline proposals (skeleton-only, no markdown)
    for (const lc of pipeline) {
      if (lc.proposal_files.some((f) => inRepoFiles.has(f))) continue;
      const pseudoFilename = lc.proposal_files[0] || `pr-${lc.pr_number}.md`;

      const existing = db
        .select({ id: schema.proposals.id })
        .from(schema.proposals)
        .where(eq(schema.proposals.filename, pseudoFilename))
        .get();

      const id = existing?.id || `PR-${lc.pr_number}`;
      const title = lc.pr_title.replace(/^Proposal:\s*/i, '').trim();
      const category = categoryFromLabels(lc.labels);

      db.insert(schema.proposals)
        .values({
          id,
          filename: pseudoFilename,
          github_pr_number: lc.pr_number,
          pr_state: lc.pr_state,
          pr_merged: false,
          in_repo: false,
          title: title || pseudoFilename.replace('.md', ''),
          author: lc.author,
          github_author: lc.author,
          status: lc.derived_status,
          category,
          labels: JSON.stringify(lc.labels),
          total_funding_cc: 0,
          created_date: lc.pr_created_at.split('T')[0],
          quarter: deriveQuarter(lc.pr_created_at),
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: schema.proposals.filename,
          set: {
            status: lc.derived_status,
            labels: JSON.stringify(lc.labels),
            pr_state: lc.pr_state,
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString(),
          } as Record<string, unknown>,
        })
        .run();
      pipeline_synced++;
    }

    const duration_ms = Date.now() - start;
    db.update(schema.sync_log)
      .set({
        status: 'completed',
        items_processed: proposals_synced + pipeline_synced,
        errors: errors.length ? JSON.stringify(errors) : null,
        completed_at: new Date().toISOString(),
      })
      .where(eq(schema.sync_log.id, sync_id))
      .run();

    return {
      sync_id,
      proposals_synced,
      milestones_synced,
      pipeline_synced,
      unchanged,
      errors,
      duration_ms,
    };
  } catch (e) {
    db.update(schema.sync_log)
      .set({
        status: 'failed',
        errors: JSON.stringify([{ error: (e as Error).message }]),
        completed_at: new Date().toISOString(),
      })
      .where(eq(schema.sync_log.id, sync_id))
      .run();
    throw e;
  }
}
