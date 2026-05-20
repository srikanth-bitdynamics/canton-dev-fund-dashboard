export interface ParsedMilestone {
  number: number;
  title: string;
  funding_cc: number;
  estimated_delivery: string | null;
  focus: string | null;
  acceptance: string | null;
}

/**
 * Parse milestones from proposal markdown.
 *
 * Handles two main formats:
 * 1. Markdown table per milestone with `| **Funding** | 200,000 CC |` row (cctools-style)
 * 2. Bulleted lists under `### Milestone N` headers with `**Funding**: X CC` (devkit-style)
 * 3. Inline mentions like "Milestone 1: Profiling harness - 90,000 CC"
 */
export function parseMilestones(content: string): {
  milestones: ParsedMilestone[];
  total_cc: number;
} {
  const milestones: ParsedMilestone[] = [];

  // Find milestone headers (### Milestone N: Title or ## Milestone N: Title)
  const headerRegex = /^#{2,4}\s+(?:\*\*)?Milestone\s+(\d+)(?:\*\*)?\s*[:\-—]?\s*(.+?)$/gm;
  const matches: { number: number; title: string; startIdx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(content)) !== null) {
    matches.push({
      number: parseInt(m[1], 10),
      title: m[2].replace(/\*\*/g, '').trim(),
      startIdx: m.index,
    });
  }

  // Fallback — payment schedule table:
  //   | Milestone | Amount (CC) | Trigger |
  //   | 1 – Core Primitives | 1,500,000 | ... |
  if (matches.length === 0) {
    const tableMilestones = extractPaymentScheduleTable(content);
    if (tableMilestones.length > 0) {
      const total = tableMilestones.reduce((s, x) => s + x.funding_cc, 0);
      return { milestones: tableMilestones, total_cc: total };
    }
  }

  // For each milestone, extract its section (until next milestone header or end)
  for (let i = 0; i < matches.length; i++) {
    const { number, title, startIdx } = matches[i];
    const endIdx = i + 1 < matches.length ? matches[i + 1].startIdx : content.length;
    const section = content.slice(startIdx, endIdx);

    // Funding — multiple patterns
    let funding_cc = 0;
    // Pattern 1: `| **Funding** | 200,000 CC |` (table row)
    let fm = section.match(/\|\s*\*\*Funding\*\*\s*\|\s*([\d,]+)\s*CC\s*\|/i);
    if (!fm) {
      // Pattern 2: `**Funding:** 200,000 CC` or `**Funding**: 200,000 CC`
      fm = section.match(/\*\*Funding\*?\*?:?\s*\*?\*?\s*([\d,]+)\s*CC/i);
    }
    if (!fm) {
      // Pattern 3: `**Amount:** 200,000 CC` or `**Cost:**`
      fm = section.match(/\*\*(?:Amount|Cost|Allocation|Payment)\*?\*?:?\s*\*?\*?\s*([\d,]+)\s*CC/i);
    }
    if (!fm) {
      // Pattern 4: First standalone "N,NNN CC" in the section (last resort)
      fm = section.match(/([\d,]{3,})\s*CC\b/);
    }
    if (fm) {
      const n = parseInt(fm[1].replace(/,/g, ''), 10);
      if (!isNaN(n) && n >= 1000) funding_cc = n;
    }

    // Estimated delivery
    let estimated_delivery: string | null = null;
    const dm = section.match(/\*\*(?:Estimated\s+Delivery|Delivery|Due|Timeline|Duration)\*?\*?:?\s*\*?\*?\s*([^\n|]+)/i);
    if (dm) estimated_delivery = dm[1].trim().replace(/\|$/, '').trim();

    // Focus / Description
    let focus: string | null = null;
    const focusMatch = section.match(/\*\*(?:Focus|Description|Goal|Objective)\*?\*?:?\s*\*?\*?\s*([^\n|]+)/i);
    if (focusMatch) focus = focusMatch[1].trim().replace(/\|$/, '').trim();

    // Acceptance criteria
    let acceptance: string | null = null;
    const accMatch = section.match(/\*\*Acceptance(?:\s+Criteria)?\*?\*?:?\s*\*?\*?\s*([^\n|]+)/i);
    if (accMatch) acceptance = accMatch[1].trim().replace(/\|$/, '').trim();

    milestones.push({
      number,
      title,
      funding_cc,
      estimated_delivery,
      focus,
      acceptance,
    });
  }

  const total_cc = milestones.reduce((s, m) => s + m.funding_cc, 0);
  return { milestones, total_cc };
}

/**
 * Extract milestones from a payment schedule markdown table.
 * Looks for a table whose header row contains "Milestone" + "Amount" or "CC".
 */
function extractPaymentScheduleTable(content: string): ParsedMilestone[] {
  const lines = content.split('\n');
  const milestones: ParsedMilestone[] = [];

  for (let i = 0; i < lines.length - 2; i++) {
    const header = lines[i].toLowerCase();
    const sep = lines[i + 1];
    if (
      header.includes('|') &&
      header.includes('milestone') &&
      (header.includes('amount') || header.includes('cc')) &&
      /^\|[\s:-]+\|/.test(sep)
    ) {
      // Read rows until non-table line
      for (let j = i + 2; j < lines.length; j++) {
        const row = lines[j].trim();
        if (!row.startsWith('|') || row.length < 5) break;
        const cells = row.split('|').slice(1, -1).map((c) => c.trim());
        if (cells.length < 2) break;
        // First cell: "1 – Core Primitives" or "1. Foo" or "Milestone 1 - Foo"
        const firstCell = cells[0];
        const numMatch = firstCell.match(/(\d+)/);
        if (!numMatch) break;
        const number = parseInt(numMatch[1], 10);
        const title = firstCell.replace(/^\s*(?:Milestone\s+)?(\d+)\s*[.–\-—:]\s*/i, '').trim();
        // Find amount cell — first cell containing a number with thousands separator
        let funding_cc = 0;
        for (let k = 1; k < cells.length; k++) {
          const amtMatch = cells[k].match(/([\d,]{4,})/);
          if (amtMatch) {
            const n = parseInt(amtMatch[1].replace(/,/g, ''), 10);
            if (!isNaN(n) && n >= 1000) {
              funding_cc = n;
              break;
            }
          }
        }
        milestones.push({
          number,
          title: title || `Milestone ${number}`,
          funding_cc,
          estimated_delivery: null,
          focus: null,
          acceptance: cells[cells.length - 1] !== title ? cells[cells.length - 1] : null,
        });
      }
      if (milestones.length > 0) return milestones;
    }
  }
  return milestones;
}
