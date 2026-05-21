# Deploy checklist

Repo is live at: https://github.com/srikanth-bitdynamics/canton-dev-fund-dashboard

Follow these steps (≈ 15 minutes total).

---

## 1. Create a Neon Postgres DB (2 min)

1. Go to https://neon.tech, sign in with GitHub
2. Create a project (any region — `aws-us-east-2` is fine)
3. Copy the connection string from the dashboard → "Connection string" → `psql` style
   - It looks like: `postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Save it for step 4

---

## 2. Create a GitHub OAuth App (3 min)

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - Application name: `Canton Dev Fund Dashboard`
   - Homepage URL: `https://canton-dev-fund-dashboard.vercel.app` (will exist after step 3)
   - Authorization callback URL: `https://canton-dev-fund-dashboard.vercel.app/api/auth/callback/github`
3. Click **Register**
4. Copy the **Client ID** (visible)
5. Click **Generate a new client secret** → copy the secret
6. Save both for step 4

---

## 3. Connect repo to Vercel (3 min)

1. Go to https://vercel.com/new
2. Import the GitHub repo `srikanth-bitdynamics/canton-dev-fund-dashboard`
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy** — it'll fail initially because env vars aren't set; that's fine
5. Note the assigned domain (probably `canton-dev-fund-dashboard.vercel.app`)
6. If the domain doesn't match what you put in the GitHub OAuth App, update the OAuth App's Homepage + Callback URLs to match the real domain

---

## 4. Set environment variables in Vercel (3 min)

In the Vercel project → **Settings → Environment Variables**, add (all to **Production** and **Preview**):

| Name | Value | Where it comes from |
|---|---|---|
| `DATABASE_URL` | `postgres://...` | From Neon (step 1) |
| `GITHUB_TOKEN` | Your PAT with `repo` scope | https://github.com/settings/tokens (classic, `repo` scope) |
| `AUTH_SECRET` | Random base64 | Run `openssl rand -base64 32` locally |
| `AUTH_GITHUB_ID` | OAuth Client ID | From GitHub OAuth App (step 2) |
| `AUTH_GITHUB_SECRET` | OAuth Client Secret | From GitHub OAuth App (step 2) |
| `GITHUB_WEBHOOK_SECRET` | Random string | Run `openssl rand -hex 32` locally |
| `CRON_SECRET` | Random string | Run `openssl rand -hex 32` locally |

---

## 5. Push the Postgres schema (2 min)

Locally:

```bash
cd /Users/srikanth/Downloads/dev-fund
export DATABASE_URL='postgres://...'   # from Neon
npx drizzle-kit push                    # creates all 7 tables in Neon
```

The `drizzle.config.ts` auto-detects `DATABASE_URL` and uses the Postgres schema.

---

## 6. Trigger first deploy + initial sync (1 min)

In Vercel:
- Settings → Deployments → click **Redeploy** on the latest commit
- Wait ~90 seconds for build to complete

Then trigger the initial data load:

```bash
curl -X POST https://canton-dev-fund-dashboard.vercel.app/api/sync
```

It should respond with `{ "proposals_synced": ~23, "pipeline_synced": ~187, ... }` after ~30 seconds.

Visit https://canton-dev-fund-dashboard.vercel.app — you should see real Canton proposals.

---

## 7. Add the GitHub webhook (1 min)

If you have admin access to `canton-foundation/canton-dev-fund`:

1. Repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://canton-dev-fund-dashboard.vercel.app/api/webhooks/github`
3. Content type: `application/json`
4. Secret: same as `GITHUB_WEBHOOK_SECRET` from step 4
5. Events: **Pull requests**, **Issues**, **Pushes**
6. Save

Real-time sync now triggers on every PR / issue / push event. The daily Vercel cron (already configured in `vercel.json`) is a backup.

---

## 8. (Optional) Hourly sync via GitHub Actions

Vercel's free Hobby plan caps cron jobs at **once per day**. The repo includes a GitHub Actions workflow (`.github/workflows/sync.yml`) that runs hourly — it's free for public repos.

Set up two repo-level secrets at https://github.com/srikanth-bitdynamics/canton-dev-fund-dashboard/settings/secrets/actions:

| Secret | Value |
|---|---|
| `DASHBOARD_URL` | `https://canton-dev-fund-dashboard.vercel.app` (no trailing slash) |
| `CRON_SECRET` | A random hex string. Also add this **same value** as the `CRON_SECRET` env var in Vercel. |

The workflow hits `/api/cron/sync` every hour at `:17`. Verify on the Actions tab: https://github.com/srikanth-bitdynamics/canton-dev-fund-dashboard/actions

If you upgrade to Vercel Pro later, you can drop the Action and uncap the `vercel.json` cron to `0 * * * *` instead.

---

## 8. Done — sign in to verify

1. Open the deployed URL
2. Click **Admin sign in** in the top right
3. Authorize GitHub
4. You should land back with `Admin · srikanth-bitdynamics` shown in the topbar
5. Navigate to **/admin** to confirm admin tools are available

---

## Optional: project board scope (Phase 2 native data)

For authoritative Board #3 / Board #5 column data instead of label-derived:

1. Locally: `gh auth refresh -s read:project --hostname github.com`
2. Get new token: `gh auth token` and update `GITHUB_TOKEN` in Vercel env vars
3. (Future code drop) — Project Board GraphQL queries are scaffolded in `src/lib/github/lifecycle.ts` but not yet wired

---

## Troubleshooting

**Build fails on Vercel with "Cannot find module 'better-sqlite3'"**
Set `DATABASE_URL` in env vars; the client.ts auto-switches to Neon and skips the SQLite require.

**Webhook returns 401**
The `GITHUB_WEBHOOK_SECRET` env var must exactly match the secret you entered on the GitHub webhook.

**`/admin` redirects to home even when signed in**
Confirm `AUTH_GITHUB_ID` is set in Vercel env (presence of this var enables the auth check). Confirm your GitHub login is in the allowlist (`hythloda` or `srikanth-bitdynamics`) — others get viewer role unless promoted via `/admin/users`.

**Sync says 0 proposals**
Run it again — the first run can hit GitHub API rate limits if your `GITHUB_TOKEN` is fresh. The DB will populate on the second attempt.
