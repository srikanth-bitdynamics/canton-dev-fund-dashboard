# Canton Dev Fund — Committee Dashboard

A live dashboard for the Canton Foundation Tech & Ops Committee, surfacing budget envelope, proposal pipeline, milestone delivery, and payment status — all sourced from `canton-foundation/canton-dev-fund`.

**Stack:** Next.js 16 · TypeScript · SQLite/Postgres (Drizzle ORM) · NextAuth.js v5 · Vercel

---

## Quick start (local dev)

```bash
git clone <this-repo>
cd dev-fund
npm install
cp .env.example .env.local
# Edit .env.local — at minimum set GITHUB_TOKEN
npx drizzle-kit push     # create local SQLite tables
npm run dev              # http://localhost:3000
curl -X POST http://localhost:3000/api/sync   # initial data sync
```

If you skip the auth env vars, admin pages remain accessible (dev escape hatch).

---

## Data model

| Source | What it gives us |
|--------|-------------------|
| `canton-foundation/canton-dev-fund/proposals/*.md` | ~23 approved proposals (markdown, parsed) |
| GitHub PR labels on the same repo | 187+ pipeline proposals (submitted, in review, voting, declined) |
| GitHub Project Board #3 (when `read:project` granted) | Authoritative lifecycle column |
| GitHub Project Board #5 (same scope) | Milestone delivery + payment status |
| Local `budget_periods` table | Quarterly CC envelope (admin-managed) |

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                 — Main dashboard (7 tabs)
│   ├── admin/                   — Admin console (gated)
│   ├── api/
│   │   ├── proposals/           — GitHub-backed proposal fetch (cached 5min)
│   │   ├── data/                — DB-backed dashboard data
│   │   ├── sync/                — Manual sync trigger
│   │   ├── cron/sync/           — Hourly Vercel cron
│   │   ├── webhooks/github/     — Real-time updates
│   │   ├── auth/[...nextauth]/  — GitHub OAuth
│   │   └── admin/{budget,users,sync-log}/
│   └── globals.css              — Full design system
├── components/
│   ├── sidebar.tsx, topbar.tsx, period-picker.tsx
│   ├── login-modal.tsx, proposal-drawer.tsx
│   ├── ui/{icons,primitives}.tsx
│   └── views/{overview,voting,proposals,milestones,payments,budget,process}.tsx
└── lib/
    ├── github/                  — Octokit client, repo + PR fetchers, lifecycle
    ├── parser/                  — Markdown parsers (proposals, milestones)
    ├── db/                      — Drizzle schema, queries, sync
    ├── auth/                    — NextAuth config + role derivation
    ├── live-data.ts             — API → AppData adapter
    └── utils.ts, types.ts
```

---

## Deploy to Vercel

### 1. Prerequisites
- A GitHub repo containing this code
- A [Vercel](https://vercel.com) account
- A [Neon](https://neon.tech) Postgres database (free tier works)
- A GitHub OAuth App (for sign-in)
- (Optional) `read:project` scope on a fine-grained token for Project Board #3/#5

### 2. Switch DB driver from SQLite → Postgres

Drizzle ORM supports both. To migrate:

1. In `src/lib/db/schema.ts` replace `drizzle-orm/sqlite-core` → `drizzle-orm/pg-core`. Each `sqliteTable` becomes `pgTable`. Most column types (`integer`, `text`) stay the same. Boolean columns: change `integer('x', { mode: 'boolean' })` → `boolean('x')`.
2. In `src/lib/db/client.ts` swap `better-sqlite3` + `drizzle-orm/better-sqlite3` for `@neondatabase/serverless` + `drizzle-orm/neon-http`.
3. Update `drizzle.config.ts` `dialect` from `'sqlite'` → `'postgresql'`, swap `dbCredentials.url` to `process.env.DATABASE_URL`.
4. Run `npx drizzle-kit push` against the new DB to create tables.

### 3. Vercel project setup

```bash
vercel link
vercel env add GITHUB_TOKEN
vercel env add DATABASE_URL          # Neon connection string
vercel env add AUTH_SECRET           # openssl rand -base64 32
vercel env add AUTH_GITHUB_ID        # from GitHub OAuth App
vercel env add AUTH_GITHUB_SECRET    # from GitHub OAuth App
vercel env add GITHUB_WEBHOOK_SECRET # random string, also set on repo webhook
vercel --prod
```

`vercel.json` already configures the hourly cron at `/api/cron/sync`.

### 4. GitHub OAuth App

Create at https://github.com/settings/developers → New OAuth App:
- Homepage URL: `https://<your-app>.vercel.app`
- Callback URL: `https://<your-app>.vercel.app/api/auth/callback/github`

### 5. GitHub webhook (for real-time updates)

On the `canton-foundation/canton-dev-fund` repo:
- Settings → Webhooks → Add webhook
- Payload URL: `https://<your-app>.vercel.app/api/webhooks/github`
- Content type: `application/json`
- Secret: same as `GITHUB_WEBHOOK_SECRET`
- Events: Pull requests, Issues, Pushes

### 6. Initial data load

```bash
curl https://<your-app>.vercel.app/api/sync -X POST
```

The cron will keep it in sync hourly from there.

---

## Recommended proposal-format changes (for canton-foundation team)

The dashboard parses two metadata formats that exist in the wild:
1. `**Key:** Value` lines (cctools, devkit, ~15 proposals)
2. Markdown table (`| Field | Value |`) (ISS-BFT, Logical Synchronizer, ~3 proposals)

Several proposals have non-standard structures that don't parse cleanly. To make the data pipeline reliable, the team should consider:

### YAML frontmatter

```yaml
---
title: "CCTools"
author: "João Matheus Camargo Gouveia"
status: Submitted
created: 2026-03-31
category: dapp-integration
champion: "Evan Varsamis (Temple Digital Group)"
funding:
  total_cc: 475000
  milestones:
    - number: 1
      title: "Learn-to-Earn Platform"
      delivery: "2026-05-01"
      funding_cc: 200000
duration_months: 5
---
```

Zero ambiguity, parseable in one line with `gray-matter`, GitHub still renders it cleanly.

### CI validation

Extend the existing `.github/workflows/sig-label-check.yml` to validate frontmatter on every PR: required fields present, milestone funding sums equal total, category is one of the 16 valid SIG labels.

### Additional fields

- `proposal_id`: sequential ID ("CDF-027")
- `organization`: for the 3-proposals-per-week rule
- `risk_level`: Low / Medium / High

---

## What's live vs. synthetic

| Data | Source |
|------|--------|
| Proposals (23 in repo) | **Live** — fetched from `canton-foundation/canton-dev-fund/proposals/*.md` |
| Pipeline (187 in PRs) | **Live** — PR labels |
| Lifecycle status | **Live** — derived from PR labels |
| Milestone delivery status | **Synthetic** — first milestone auto-marked delivered (replace once Project Board #5 wired) |
| Payment ledger | **Synthetic** — generated from delivered milestones (replace with on-chain mint events) |
| Quarterly budget envelope | **Manual** — entered via `/admin/budget` |
| Committee votes | **Mock** — needs Project Board #3 vote integration (requires `read:project`) |

---

## What's left

- [ ] Wire Project Board #3 status via GraphQL (needs `read:project` scope)
- [ ] Wire Project Board #5 milestone delivery + payment events
- [ ] Replace synthetic payments with real on-chain mint events (per CIP-0100, recipients mint CC directly)
- [ ] Build out historical snapshot table so week-over-week deltas are real (cron writes nightly)
- [ ] Propose YAML frontmatter PR to canton-foundation

---

## License

MIT
