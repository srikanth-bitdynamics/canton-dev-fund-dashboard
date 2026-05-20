import type { Config } from 'drizzle-kit';
import path from 'path';

// Auto-switch by DATABASE_URL presence.
//   - Prod: drizzle-kit push uses Postgres schema + DATABASE_URL
//   - Dev:  drizzle-kit push uses SQLite schema + local file
const USE_POSTGRES = !!process.env.DATABASE_URL;

export default (USE_POSTGRES
  ? {
      schema: './src/lib/db/schema.pg.ts',
      out: './drizzle-pg',
      dialect: 'postgresql',
      dbCredentials: { url: process.env.DATABASE_URL! },
    }
  : {
      schema: './src/lib/db/schema.ts',
      out: './drizzle',
      dialect: 'sqlite',
      dbCredentials: {
        url: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dev-fund.db'),
      },
    }) satisfies Config;
