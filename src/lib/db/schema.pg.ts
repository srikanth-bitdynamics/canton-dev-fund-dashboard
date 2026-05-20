// Postgres equivalent of schema.ts — used in production on Neon.
// Schema is otherwise identical to the SQLite version; column types adapted.

import { pgTable, text, integer, bigint, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const proposals = pgTable('proposals', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull().unique(),
  github_pr_number: integer('github_pr_number'),
  pr_state: text('pr_state'),
  pr_merged: boolean('pr_merged').default(false),
  in_repo: boolean('in_repo').default(false),

  title: text('title').notNull(),
  author: text('author'),
  author_email: text('author_email'),
  github_author: text('github_author'),
  champion: text('champion'),

  status: text('status').notNull().default('submitted'),
  category: text('category'),
  raw_category: text('raw_category'),
  labels: text('labels'),

  total_funding_cc: bigint('total_funding_cc', { mode: 'number' }).notNull().default(0),
  created_date: text('created_date'),
  updated_date: text('updated_date'),
  approved_date: text('approved_date'),
  quarter: text('quarter'),

  website: text('website'),
  twitter: text('twitter'),

  raw_content_hash: text('raw_content_hash'),
  parse_warnings: text('parse_warnings'),

  overrides: text('overrides').default('[]'),
  milestones_locked: boolean('milestones_locked').default(false),

  synced_at: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const milestones = pgTable('milestones', {
  id: text('id').primaryKey(),
  proposal_id: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  milestone_number: integer('milestone_number').notNull(),
  title: text('title'),
  funding_cc: bigint('funding_cc', { mode: 'number' }).notNull().default(0),
  estimated_delivery: text('estimated_delivery'),
  estimated_delivery_date: text('estimated_delivery_date'),
  focus: text('focus'),
  acceptance: text('acceptance'),
  status: text('status').notNull().default('planned'),
  board_status: text('board_status'),
  github_issue_number: integer('github_issue_number'),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  payment_released_at: timestamp('payment_released_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const budget_periods = pgTable('budget_periods', {
  id: text('id').primaryKey(),
  period_name: text('period_name').notNull().unique(),
  start_date: text('start_date').notNull(),
  end_date: text('end_date').notNull(),
  total_budget_cc: bigint('total_budget_cc', { mode: 'number' }).notNull(),
  notes: text('notes'),
  is_current: boolean('is_current').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  milestone_id: text('milestone_id').notNull().references(() => milestones.id, { onDelete: 'cascade' }),
  amount_cc: bigint('amount_cc', { mode: 'number' }).notNull(),
  scheduled_date: text('scheduled_date'),
  released_date: text('released_date'),
  status: text('status').notNull().default('pending'),
  transaction_hash: text('transaction_hash'),
  notes: text('notes'),
  evidence_url: text('evidence_url'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  github_id: integer('github_id').notNull().unique(),
  github_login: text('github_login').notNull(),
  name: text('name'),
  avatar_url: text('avatar_url'),
  role: text('role').notNull().default('viewer'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const audit_log = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actor_login: text('actor_login'),
  actor_role: text('actor_role'),
  action: text('action').notNull(),
  target_type: text('target_type').notNull(),
  target_id: text('target_id').notNull(),
  before_json: text('before_json'),
  after_json: text('after_json'),
  note: text('note'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const sync_log = pgTable('sync_log', {
  id: text('id').primaryKey(),
  sync_type: text('sync_type').notNull(),
  source: text('source'),
  status: text('status').notNull().default('started'),
  items_processed: integer('items_processed').default(0),
  errors: text('errors'),
  started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});
