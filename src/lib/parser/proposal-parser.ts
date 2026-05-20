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

  // Title extraction strategy:
  //   1. Find the first H1 (`# X`)
  //   2. Unwrap markdown bold; handle the "Development Fund Proposal[:...]" prefix smartly:
  //      - "Development Fund Proposal: CCTools" → "CCTools" (colon = subtitle separator)
  //      - "Development Fund Proposal for Maintenance of X" → keep full (natural continuation)
  //      - "Development Fund Proposal" (exact) → look for the next informative heading
  //   3. Skip generic section headers (Abstract, Motivation, Specification, ...) when picking
  //      the next heading as fallback
  //   4. Final fallback: prettify the filename slug
  const genericHeads = new Set([
    'development fund proposal', 'abstract', 'executive summary', 'motivation',
    'introduction', 'overview', 'summary', 'proposal', 'specification',
    'objective', 'objectives', 'background', 'context', 'funding',
    'implementation', 'rationale', 'acceptance criteria', 'milestones',
    'design', 'goals', 'scope', 'milestones and deliverables',
    'milestones, deliverables, and acceptance criteria',
    'milestones deliverables and acceptance criteria',
    '1. objective', '2. objective', 'co-marketing',
    'team', 'team background', 'assumptions', 'maintenance',
    'design alternatives considered', 'note on performance targets',
    'the opportunity', 'the problem', 'why', 'strategic fit',
    'implementation mechanics', 'backward compatibility',
    'current platform (already live)', 'current platform',
    'payment schedule', 'early completion bonus', 'volatility',
  ]);

  const unwrap = (raw: string): string =>
    raw
      .replace(/^#+\s+/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\\\s*$/, '')
      .replace(/^\d+\.\s+/, '')                   // strip "1. ", "2.3 ", etc.
      .replace(/^\d+(?:\.\d+)*\s+/, '')
      .trim();

  const isGeneric = (s: string): boolean => {
    const lower = s.toLowerCase();
    if (genericHeads.has(lower)) return true;
    // Section-number-prefixed headers like "2.1 Mempool", "3.4 Foo"
    if (/^\d+(?:\.\d+)*\s/.test(s)) return true;
    return false;
  };

  const stripDFPPrefix = (s: string): string => {
    // "Development Fund Proposal: X" or "Development Fund Proposal — X"  → "X"
    const m = s.match(/^Development\s+Fund\s+Proposal[:\-—]\s*(.+)$/i);
    if (m) return m[1].trim();
    return s;
  };

  // Strategy:
  // 1. Try the first non-empty line — if it's a bold-only line like **CIP-0100 X**,
  //    that's the title (some proposals use bold body text at top instead of an H1).
  // 2. Else look at all H1/H2 headings in the file.
  //    - Prefer the first one whose stripped form is non-generic.
  //    - Always strip "Development Fund Proposal:" / "Development Fund Proposal —" prefix.
  // 3. Filename fallback (cleaned).
  let title = '';
  const firstLines = content.split('\n').slice(0, 6);
  for (const line of firstLines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) break; // headings handled below
    const boldMatch = t.match(/^\*\*(.+?)\*\*$/);
    if (boldMatch) {
      const candidate = boldMatch[1].trim();
      if (!isGeneric(candidate) && candidate.length > 3) {
        title = candidate;
        break;
      }
    }
  }

  if (!title) {
    // Only consider headings near the top of the file. A title appears early; any
    // non-generic heading deep in the body (e.g., "# Open Source" at line 700 of a
    // long proposal) is a section header, not the title.
    const headings = [...content.matchAll(/^(#{1,2})\s+(.+?)$/gm)]
      .slice(0, 5)
      .map((m) => ({ level: m[1].length, raw: m[2], clean: unwrap(m[2]) }))
      .filter((h) => h.clean.length > 0);

    // First pass: prefer H1 titles, accept H2 only when it explicitly looks like a title
    for (const h of headings) {
      const stripped = stripDFPPrefix(h.clean);
      const looksLikeTitle =
        h.level === 1 ||
        stripped !== h.clean ||                     // had DFP prefix that we stripped
        /^\*\*.+\*\*$/.test(h.raw.trim());          // bold-wrapped in source
      if (looksLikeTitle && !isGeneric(stripped) && stripped.length > 3) {
        title = stripped;
        break;
      }
    }

    // Second pass: if first H1 is the generic "Development Fund Proposal" and the very
    // next heading is a non-generic H2, that's the title.
    if (!title && headings.length >= 2) {
      const first = headings[0];
      const second = headings[1];
      if (
        first.level === 1 &&
        /^development fund proposal$/i.test(first.clean) &&
        second.level === 2 &&
        !isGeneric(second.clean) &&
        second.clean.length > 3
      ) {
        title = second.clean;
      }
    }

    // Third pass: if the very first heading is H2 (no H1 in file) and non-generic, use it.
    // openzeppelin-canton-ecosystem-stack.md is structured this way.
    if (!title && headings.length > 0) {
      const first = headings[0];
      if (first.level === 2 && !isGeneric(first.clean) && first.clean.length > 3) {
        const stripped = stripDFPPrefix(first.clean);
        title = stripped;
      }
    }
  }

  if (!title) {
    // Known acronyms / brand casing we want to preserve verbatim
    const preserveCase: Record<string, string> = {
      sv: 'SV', dapp: 'dApp', dapps: 'dApps', dpm: 'DPM', daml: 'Daml',
      sdk: 'SDK', sdks: 'SDKs', api: 'API', apis: 'APIs', cli: 'CLI',
      pqs: 'PQS', dex: 'DEX', defi: 'DeFi', cc: 'CC', oss: 'OSS',
      devkit: 'DevKit', cctools: 'CCTools',
    };
    title = filename
      .replace(/\.md$/, '')
      .replace(/^\d{4}-\d{2}-/, '')
      .replace(/Development[- ]Fund[- ]Proposal[- ]/i, '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word) => {
        const lower = word.toLowerCase();
        if (preserveCase[lower]) return preserveCase[lower];
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

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
