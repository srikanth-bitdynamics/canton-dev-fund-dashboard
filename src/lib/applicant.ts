// Normalize applicant strings to a canonical "company" name.
//
// Examples (input → output):
//   "Wayne Collier, Digital Asset"          → "Digital Asset"
//   "Wayne Collier (Digital Asset)"         → "Digital Asset"
//   "Eric Mann (Avro Digital)"              → "Avro Digital"
//   "Digital Asset"                         → "Digital Asset"
//   "OpenZeppelin"                          → "OpenZeppelin"
//   "João Matheus Camargo Gouveia"          → "João Matheus Camargo Gouveia" (individual)
//   "Noders LLC"                            → "Noders LLC"
//   "Ryan Wishnow"                          → "Ryan Wishnow" (no company)
//   "[Noders LLC](https://noders.team/)"    → "Noders LLC"
//   "Wayne Collier, Digital Asset, and Divam Narula, Obsidian Systems" → "Digital Asset" (first)
//   ": Digital Asset"                       → "Digital Asset"

// Aliases — common variations that should collapse to one company name
const ALIAS: Record<string, string> = {
  'digitalasset': 'Digital Asset',
  'da': 'Digital Asset',
  'avrodigital': 'Avro Digital',
  'temple digital group': 'Temple Digital Group',
  'bitdynamics': 'BitDynamics',
  'bitsafe': 'BitSafe',
  'noders llc': 'Noders LLC',
  'noders': 'Noders LLC',
  'obsidian systems': 'Obsidian Systems',
  'openzeppelin': 'OpenZeppelin',
  'zenith': 'Zenith',
  'vertexpoint labs': 'VertexPoint Labs',
};

const STOPWORDS = new Set(['inc', 'llc', 'ltd', 'corp', 'corporation', 'gmbh', 'co']);

export function normalizeCompany(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  let s = raw.trim();
  // Strip leading punctuation like ":"
  s = s.replace(/^[:\s]+/, '');
  // Markdown link: [Name](url)
  const linkMatch = s.match(/^\[([^\]]+)\]/);
  if (linkMatch) s = linkMatch[1].trim();
  // Parenthesized form: "Person (Company)" → "Company"
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const company = parenMatch[1].trim();
    return canonicalize(company);
  }
  // Comma form: "Person, Company" or "Person, Company, and Person2, Company2"
  // Heuristic: if there's a comma and the right-hand side has 2+ words capitalized OR is a known alias, use it
  if (s.includes(',')) {
    const parts = s.split(/,| and /).map((p) => p.trim()).filter(Boolean);
    // Look for the first part that is a known company alias
    for (const p of parts) {
      const c = canonicalize(p);
      if (ALIAS[p.toLowerCase()] || /^[A-Z]/.test(c)) {
        // Skip individual names (look like "First Last")
        if (looksLikeIndividual(p)) continue;
        return c;
      }
    }
  }
  return canonicalize(s);
}

function canonicalize(s: string): string {
  const cleaned = s.trim().replace(/<[^>]*>/g, '').replace(/\\$/, '').trim();
  const lower = cleaned.toLowerCase();
  if (ALIAS[lower]) return ALIAS[lower];
  return cleaned;
}

function looksLikeIndividual(s: string): boolean {
  // "Wayne Collier", "Eric Mann", "João Matheus Camargo Gouveia"
  // — 2-4 capitalized words with no organization-ish words
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  const capitalCount = words.filter((w) => /^[A-ZÀ-ſ]/.test(w)).length;
  if (capitalCount < words.length - 1) return false; // most should be capitalized
  // Reject if contains stopwords / corporate terms
  if (words.some((w) => STOPWORDS.has(w.toLowerCase()))) return false;
  return true;
}
