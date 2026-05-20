import { parseMilestones, type ParsedMilestone } from './milestone-parser';

export interface ParsedProposal {
  filename: string;
  title: string;
  author: string | null;
  author_email: string | null;
  status: string | null;
  created: string | null;
  updated: string | null;
  champion: string | null;
  category: string | null;
  website: string | null;
  twitter: string | null;
  total_funding_cc: number;
  milestones: ParsedMilestone[];
  raw_metadata: Record<string, string>;
  parse_warnings: string[];
}

const SIG_CATEGORIES = new Set([
  'dapp-integration', 'wallet-apps', 'attestor-pools-daos-multisig',
  'defi-liquidity', 'party-portability-data-resilience', 'token-asset-standards',
  'tokenomics', 'onchain-governance', 'daml-tooling', 'dar-app-management',
  'canton-protocol-multi-synchronizer', 'canton-apis', 'node-deployment-operations',
  'global-synchronizer-scaling', 'financial-workflows-composability', 'regulatory-compliance',
]);

/** Parse a proposal markdown file into structured data. */
export function parseProposal(filename: string, content: string): ParsedProposal {
  const warnings: string[] = [];

  // Title — first H1 line
  const titleMatch = content.match(/^#\s+(.+?)$/m);
  const title = titleMatch
    ? titleMatch[1].replace(/^Development Fund Proposal:\s*/i, '').trim()
    : filename.replace('.md', '');

  // Metadata block — two supported formats:
  //   A) `**Key:** Value` lines (cctools/devkit style)
  //   B) Markdown table with `| Key | Value |` rows (ISS-BFT style)
  const metadata: Record<string, string> = {};
  // Only parse metadata from the first ~80 lines to avoid catching inline bold in body
  const headerSection = content.split('\n').slice(0, 80).join('\n');

  // Format A
  const metaRegex = /^\*\*([A-Za-z][\w\s/-]*?):\*\*\s*(.+?)$/gm;
  let m: RegExpExecArray | null;
  while ((m = metaRegex.exec(headerSection)) !== null) {
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (key.length > 30) continue;
    if (!metadata[key]) metadata[key] = value;
  }

  // Format B — table rows
  const tableRowRegex = /^\|\s*([A-Za-z][\w\s/-]{0,30})\s*\|\s*(.+?)\s*\|/gm;
  while ((m = tableRowRegex.exec(headerSection)) !== null) {
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    // Skip header rows
    if (key === 'field' || key === 'value' || /^:?-+:?$/.test(value)) continue;
    if (key.length > 30) continue;
    if (!metadata[key]) metadata[key] = value;
  }

  // Author + email
  let author: string | null = null;
  let author_email: string | null = null;
  if (metadata.author) {
    const emailMatch = metadata.author.match(/^(.+?)\s*\(([^)]+@[^)]+)\)/);
    if (emailMatch) {
      author = emailMatch[1].trim();
      author_email = emailMatch[2].trim();
    } else {
      author = metadata.author;
    }
  } else {
    warnings.push('No Author field found');
  }

  // Status
  const status = metadata.status || null;
  if (!status) warnings.push('No Status field found');

  // Dates
  const created = normalizeDate(metadata.created) ?? null;
  const updated = normalizeDate(metadata.updated) ?? null;

  // Champion — strip markdown links if present
  let champion: string | null = null;
  if (metadata.champion) {
    const linkMatch = metadata.champion.match(/^\[([^\]]+)\]/);
    champion = linkMatch ? linkMatch[1] : metadata.champion;
    // Strip leading "Need" placeholders
    if (/^(need|tbd|none)/i.test(champion)) champion = null;
  }

  // Category — sometimes labeled "Label", sometimes "Category"
  let category: string | null = null;
  const labelText = metadata.label || metadata.category;
  if (labelText) {
    // Match against known SIG categories
    for (const cat of SIG_CATEGORIES) {
      if (labelText.toLowerCase().includes(cat)) {
        category = cat;
        break;
      }
    }
    if (!category) {
      // Maybe a comma-separated list — take first known one
      const tokens = labelText.toLowerCase().split(/[\s,]+/);
      for (const tok of tokens) {
        if (SIG_CATEGORIES.has(tok)) {
          category = tok;
          break;
        }
      }
    }
  }

  // Website, Twitter
  const website = metadata.website || null;
  const twitter = metadata.twitter || metadata['x'] || null;

  // Milestones + funding
  const { milestones, total_cc } = parseMilestones(content);
  if (milestones.length === 0) warnings.push('No milestones detected');

  // Total funding — try to find explicit total in content
  let total_funding_cc = total_cc;
  let is_recurring = false;

  // Patterns ranked by specificity. First match wins.
  const totalPatterns: { rx: RegExp; recurring?: boolean; multiplier?: number }[] = [
    // "**Total Funding Request: 20,000,000 CC**" / "Total Funding Request: ... 20M CC"
    { rx: /\*\*Total\s+Funding\s+Request[^*]*?([\d,]+)\s*(?:CC|Canton\s+Coin)/i },
    { rx: /Total\s+Funding\s+Request:?\s*\*?\*?([\d,]+)\s*(?:CC|Canton\s+Coin)/i },
    // "**Funding Request: 12,000,000 Canton Coin (CC).**"
    { rx: /\*\*Funding\s+Request:\s*([\d,]+)\s*(?:CC|Canton\s+Coin)/i },
    // "**Baseline total payment 12,000,000 Canton Coin (CC).**"
    { rx: /Baseline\s+total\s+payment\s+([\d,]+)\s*(?:CC|Canton\s+Coin)/i },
    // "Total Ask / Total Grant / Total Funding"
    { rx: /\*\*Total\s+(?:Ask|Grant|Funding)[^*]*?\*?\*?\s*([\d,]+)\s*(?:CC|Canton\s+Coin)/i },
    // Sentence form: "request is for a grant of 7,800,000 Canton Coin"
    // or "requests a grant of X CC"
    { rx: /(?:request\s+is\s+for\s+a\s+grant\s+of|requests?\s+a\s+grant\s+of)\s+([\d,]+)\s*(?:CC|Canton\s+Coin)/i },
    // "(5,290,000 CC)" parenthesized after a USD amount — DAML Training v2 style
    { rx: /\$[\d,.]+\s+USD\s+\(\s*([\d,]+)\s*CC\)/i },
    // "grant is denominated in fixed amount of **1,900,000 CC**" / "denominated ... **N CC**"
    { rx: /grant\s+is\s+denominated[^*]{0,200}?\*\*([\d,]+)\s*CC\*\*/i },
    // Recurring monthly grants — annualize (×12)
    { rx: /recurring\s+monthly\s+grant\s+of\s+([\d,]+)\s*(?:CC|Canton\s+Coin)/i, recurring: true, multiplier: 12 },
    { rx: /Funding\s+Request:\*?\*?\s*([\d,]+)\s*(?:CC|Canton\s+Coin)\s+per\s+month/i, recurring: true, multiplier: 12 },
    { rx: /([\d,]+)\s*(?:CC|Canton\s+Coin)\s+per\s+month/i, recurring: true, multiplier: 12 },
  ];

  for (const pat of totalPatterns) {
    const tm = content.match(pat.rx);
    if (tm) {
      let explicit = parseInt(tm[1].replace(/,/g, ''), 10);
      if (isNaN(explicit) || explicit < 10_000) continue;
      if (pat.multiplier) explicit *= pat.multiplier;
      // Prefer explicit total over milestone sum if they disagree significantly,
      // or if no milestones parsed.
      if (total_funding_cc === 0 || Math.abs(explicit - total_funding_cc) > total_funding_cc * 0.1) {
        total_funding_cc = explicit;
      }
      if (pat.recurring) is_recurring = true;
      break;
    }
  }

  if (total_funding_cc === 0) warnings.push('No funding amount detected');
  if (is_recurring) warnings.push('Recurring monthly grant — annualized to 12 months');

  return {
    filename,
    title,
    author,
    author_email,
    status,
    created,
    updated,
    champion,
    category,
    website,
    twitter,
    total_funding_cc,
    milestones,
    raw_metadata: metadata,
    parse_warnings: warnings,
  };
}

function normalizeDate(s: string | undefined): string | null {
  if (!s) return null;
  // Match YYYY-MM-DD
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}
