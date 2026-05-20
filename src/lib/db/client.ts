/**
 * Database client — auto-switches between SQLite (dev) and Postgres (prod).
 *
 * - If DATABASE_URL is set (Postgres connection string), use Neon + pg schema
 * - Otherwise fall back to better-sqlite3 with the local file
 *
 * Both schemas have identical table/column names so query code is portable.
 * We type the export as the SQLite variant — Drizzle's Postgres client has
 * a structurally compatible API for the operations we use (select/insert/
 * update/delete/where/orderBy/limit/get/all/run).
 */

import { drizzle as drizzleSqlite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import * as sqliteSchema from './schema';
import * as pgSchema from './schema.pg';

const USE_POSTGRES = !!process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var _devFundDb: BetterSQLite3Database<typeof sqliteSchema> | undefined;
  // eslint-disable-next-line no-var
  var _devFundSqliteRaw: Database.Database | undefined;
}

function createSqliteDb(): BetterSQLite3Database<typeof sqliteSchema> {
  const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dev-fund.db');
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  if (process.env.NODE_ENV !== 'production') {
    globalThis._devFundSqliteRaw = sqlite;
  }
  return drizzleSqlite(sqlite, { schema: sqliteSchema });
}

function createPostgresDb(): BetterSQLite3Database<typeof sqliteSchema> {
  // Dynamic-require so SQLite-only environments don't fail to bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/neon-http');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL!);
  // The Postgres Drizzle client is structurally compatible for our usage;
  // cast to the SQLite type so the rest of the codebase stays typed cleanly.
  return drizzle(sql, { schema: pgSchema }) as unknown as BetterSQLite3Database<typeof sqliteSchema>;
}

function createDb(): BetterSQLite3Database<typeof sqliteSchema> {
  return USE_POSTGRES ? createPostgresDb() : createSqliteDb();
}

const _db = globalThis._devFundDb || createDb();
if (process.env.NODE_ENV !== 'production' && !globalThis._devFundDb) {
  globalThis._devFundDb = _db;
}

export const db = _db;
export const schema = sqliteSchema;
