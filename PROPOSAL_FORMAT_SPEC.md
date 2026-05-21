# Proposed standard for Canton Dev Fund proposals

> A small, deterministic format that lets dashboards, CI, and humans read
> proposals without per-file heuristics.

## Why

Today there are at least four metadata styles in `canton-dev-fund/proposals/`:
- `**Author:** X` inline bold (cctools, devkit)
- `| Author | X |` markdown table (ISS-BFT, Traffic-Based App Rewards)
- "Funding Request: 12,000,000 Canton Coin (CC)." inline prose (LSU)
- recurring-grant patterns ("2,000,000 CC per month")

A dashboard, a CI validator, or any consumer must reinvent a fuzzy parser to
read these. With a single canonical format, every consumer is a one-liner.

---

## Proposal: YAML frontmatter

Every proposal file starts with a fenced YAML block. The free-form markdown
body keeps everything that's useful for humans (motivation, specification,
rationale). The YAML block carries the **machine-readable contract**.

```yaml
---
id: CDF-027                                       # required, unique sequential
title: "OpenZeppelin Canton Ecosystem Stack"      # required
applicant: "OpenZeppelin"                          # required
applicant_email: "team@openzeppelin.com"           # optional
champion: "Digital Asset"                          # optional, SIG champion
category: reference                                # required — one of: protocol | devtools | security | reference | infra | defi
sig_label: financial-workflows-composability       # optional — one of the 16 SIG categories
status: Submitted                                  # required — Draft | Submitted | Champion Review | Tech Review | Voting | Approved | Declined
created: 2026-04-28                                # required (YYYY-MM-DD)
updated: 2026-05-15                                # optional
duration_months: 24                                # required if > 6 (triggers volatility re-evaluation)
website: https://openzeppelin.com                  # optional
twitter: https://x.com/OpenZeppelin                 # optional
funding:
  total_cc: 28378378                               # required, integer (sum of milestones)
  recurring: false                                 # optional — true for monthly grants
  milestones:                                      # required, at least 1
    - n: 1
      title: "Token Foundation and dApp Framework"
      amount_cc: 3547297
      due_date: 2026-07-31                          # YYYY-MM-DD or relative "Month 3"
      acceptance:
        - "Token standard reference impl published"
        - "3 dApps integrated"
    - n: 2
      title: "DEX Reference Implementation"
      amount_cc: 3547297
      due_date: 2026-10-31
    # ... etc
---

# OpenZeppelin Canton Ecosystem Stack

(free-form proposal body continues here — abstract, motivation,
specification, rationale, etc.)
```

### Field reference

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | ✓ | string | Format `CDF-NNN`, assigned by committee on first submission |
| `title` | ✓ | string | Plain, no markdown |
| `applicant` | ✓ | string | Org or individual |
| `applicant_email` |   | string | Contact email |
| `champion` |   | string | SIG champion name (added when assigned) |
| `category` | ✓ | enum | `protocol \| devtools \| security \| reference \| infra \| defi` |
| `sig_label` |   | enum | One of the 16 SIG categories (auto-applied as PR label) |
| `status` | ✓ | enum | See lifecycle below |
| `created` | ✓ | date | YYYY-MM-DD |
| `updated` |   | date | YYYY-MM-DD |
| `duration_months` |   | integer | Required if > 6 (volatility clause) |
| `website` |   | url | |
| `twitter` |   | url | |
| `funding.total_cc` | ✓ | integer | Sum of milestone amounts. CI must validate equality. |
| `funding.recurring` |   | boolean | True for monthly-grant patterns |
| `funding.milestones` | ✓ | array | At least 1 milestone |
| `funding.milestones[].n` | ✓ | integer | Sequential 1, 2, 3 ... |
| `funding.milestones[].title` | ✓ | string | |
| `funding.milestones[].amount_cc` | ✓ | integer | |
| `funding.milestones[].due_date` |   | date \| string | YYYY-MM-DD preferred; "Month N" allowed |
| `funding.milestones[].acceptance` |   | array of strings | Concrete completion criteria |

### Lifecycle (status field)

```
Draft → Submitted → Champion Review → Tech Review → Voting → Approved → (milestones tracked separately)
                                            ↓
                                       Declined
```

The status field is updated by the author (Draft → Submitted) and then by the
committee (subsequent transitions). PR labels and Project Board #3 columns are
**derived from this field** automatically (a small GitHub Action does it).

---

## CI validation

Add this to `.github/workflows/proposal-validate.yml`:

```yaml
name: Validate proposal
on:
  pull_request:
    paths: ['proposals/**.md']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22 }
      - run: npm i -g @canton-foundation/proposal-validator   # small new package
      - run: validate-proposal "proposals/$(ls proposals/ | head -1)"
```

The validator checks:

1. **YAML parses cleanly** (`---` fences exist, body is valid YAML)
2. **Required fields present** (id, title, applicant, category, status, created, funding.total_cc, funding.milestones)
3. **`id` matches `CDF-NNN` pattern** and is unique across all proposals
4. **`category` is one of 6 dashboard categories**
5. **`sig_label` (if present) is one of 16 valid SIG labels**
6. **`status` is one of 7 valid lifecycle states**
7. **Dates are valid YYYY-MM-DD**
8. **`funding.total_cc` equals sum of `funding.milestones[].amount_cc`** (off-by-rounding allowed, <0.1%)
9. **Each milestone has `n` (sequential), `title`, `amount_cc`**
10. **If `duration_months > 6`, volatility note exists in body** (regex check)

On failure: PR review comment with line-numbered errors. On success: green check.

---

## What this unlocks for the dashboard

With this format in place, the entire dashboard sync becomes:

```typescript
const files = await listProposalFiles();
for (const file of files) {
  const { data: meta, content } = matter(await fetchFile(file));
  db.upsert(proposals, {
    id: meta.id,
    title: meta.title,
    applicant: meta.applicant,
    status: meta.status,
    category: meta.category,
    total_funding_cc: meta.funding.total_cc,
    // ... etc
  });
  for (const m of meta.funding.milestones) {
    db.upsert(milestones, {
      id: `${meta.id}-M${m.n}`,
      proposal_id: meta.id,
      title: m.title,
      funding_cc: m.amount_cc,
      ...
    });
  }
}
```

No regex hunting. No title-similarity matching. No deep-body heading scans.

---

## Migration path

1. **Land the format spec** (this doc) as a PR to `canton-dev-fund/CONTRIBUTING.md`
2. **Update the proposal template** (`proposals/_template.md`) to use the new frontmatter
3. **Add CI validator** for new PRs only — don't break existing proposals
4. **One-time backfill PR** — convert the existing ~23 proposals to the new format
   (the dashboard repo can ship a backfill script that reads current files and
   writes the frontmatter)
5. **Drop legacy parser support** in the dashboard once backfill is merged

Steps 1–3 are independent and can be done in any order. The dashboard already
accepts both formats today (via the ledger fallback in Issue #1), so there's
no rush on step 4.

---

## Alternative considered: GitHub native fields

GitHub Projects has custom fields. We could put everything (CC amount, status,
category) on the Project Board #3 / #5 directly without modifying the proposal
files. Pros: native UI editing. Cons: invisible to anyone reading the .md
files, no review history, requires `read:project` scope for every consumer,
not portable if the team ever switches off GitHub.

The YAML-frontmatter approach is portable, human-readable, version-controlled
in PRs, and validates cleanly. Recommended.
