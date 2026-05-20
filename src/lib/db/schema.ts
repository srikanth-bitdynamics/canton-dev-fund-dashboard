import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// All amounts in CC (Canton Coin) stored as integer (no decimals).
// Dates stored as ISO strings (YYYY-MM-DD) or full timestamps.

export const proposals = sqliteTable('proposals', {
  id: text('id').primaryKey(), // CDF-001, CDF-002, ...
  filename: text('filename').notNull().unique(),
  github_pr_number: integer('github_pr_number'),
  pr_state: text('pr_state'), // open | closed
  pr_merged: integer('pr_merged', { mode: 'boolean' }).default(false),
  in_repo: integer('in_repo', { mode: 'boolean' }).default(false),

  title: text('title').notNull(),
  author: text('author'),
  author_email: text('author_email'),
  github_author: text('github_author'),
  champion: text('champion'),

  status: text('status').notNull().default('submitted'), // submitted | champion-review | tech-review | voting | approved | declined
  category: text('category'), // protocol | devtools | security | reference | infra | defi
  raw_category: text('raw_category'), // SIG label from GitHub
  labels: text('labels'), // JSON array of GitHub labels

  total_funding_cc: integer('total_funding_cc').notNull().default(0),
  created_date: text('created_date'), // YYYY-MM-DD
  updated_date: text('updated_date'),
  approved_date: text('approved_date'),
  quarter: text('quarter'), // 2026-Q2 etc.

  website: text('website'),
  twitter: text('twitter'),

  raw_content_hash: text('raw_content_hash'), // SHA-256 of markdown — skip on re-sync
  parse_warnings: text('parse_warnings'), // JSON array of warnings

  // Sync protection — fields admin manually edited; the next sync skips these
  overrides: text('overrides').default('[]'), // JSON array of field names: ['title', 'champion', ...]
  milestones_locked: integer('milestones_locked', { mode: 'boolean' }).default(false),

  synced_at: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),
  proposal_id: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  milestone_number: integer('milestone_number').notNull(),
  title: text('title'),
  funding_cc: integer('funding_cc').notNull().default(0),
  estimated_delivery: text('estimated_delivery'),
  estimated_delivery_date: text('estimated_delivery_date'), // YYYY-MM-DD if parseable
  focus: text('focus'),
  acceptance: text('acceptance'),
  status: text('status').notNull().default('planned'), // planned | in-progress | in-review | delivered | at-risk
  board_status: text('board_status'), // From Project Board #5 (when read:project granted)
  github_issue_number: integer('github_issue_number'),
  approved_at: text('approved_at'),
  payment_released_at: text('payment_released_at'),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const budget_periods = sqliteTable('budget_periods', {
  id: text('id').primaryKey(),
  period_name: text('period_name').notNull().unique(), // Q1 2026, Q2 2026, ...
  start_date: text('start_date').notNull(),
  end_date: text('end_date').notNull(),
  total_budget_cc: integer('total_budget_cc').notNull(),
  notes: text('notes'),
  is_current: integer('is_current', { mode: 'boolean' }).default(false),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  milestone_id: text('milestone_id').notNull().references(() => milestones.id, { onDelete: 'cascade' }),
  amount_cc: integer('amount_cc').notNull(),
  scheduled_date: text('scheduled_date'),
  released_date: text('released_date'),
  status: text('status').notNull().default('pending'), // pending | scheduled | released | held
  transaction_hash: text('transaction_hash'),
  notes: text('notes'),
  evidence_url: text('evidence_url'), // link to GitHub issue/comment with delivery evidence
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  github_id: integer('github_id').notNull().unique(),
  github_login: text('github_login').notNull(),
  name: text('name'),
  avatar_url: text('avatar_url'),
  role: text('role').notNull().default('viewer'), // viewer | committee_member | admin
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const audit_log = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actor_login: text('actor_login'), // GitHub login of the admin who made the change
  actor_role: text('actor_role'),   // role at time of change
  action: text('action').notNull(), // 'update_proposal' | 'release_payment' | 'lock_milestones' | 'create_budget' | etc.
  target_type: text('target_type').notNull(), // 'proposal' | 'milestone' | 'budget_period' | 'user' | 'payment'
  target_id: text('target_id').notNull(),
  before_json: text('before_json'), // JSON snapshot of changed fields, pre-edit
  after_json: text('after_json'),   // JSON snapshot, post-edit
  note: text('note'),               // optional human-readable summary
  at: text('at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sync_log = sqliteTable('sync_log', {
  id: text('id').primaryKey(),
  sync_type: text('sync_type').notNull(), // full_sync | webhook | manual
  source: text('source'), // proposals | prs | board_3 | board_5
  status: text('status').notNull().default('started'), // started | completed | failed
  items_processed: integer('items_processed').default(0),
  errors: text('errors'), // JSON array
  started_at: text('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  completed_at: text('completed_at'),
});
