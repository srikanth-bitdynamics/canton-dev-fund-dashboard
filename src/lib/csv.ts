// Minimal CSV helpers. Browser-only — uses Blob + URL.createObjectURL to push
// a download. Stays dependency-free (papaparse would be overkill).

/** Escape one CSV cell per RFC 4180. */
function csvCell(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else s = String(v);
  // Quote if contains comma, quote, newline, or leading/trailing whitespace.
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Build a CSV string from a list of objects + a column spec. */
export function toCsv<T>(
  rows: T[],
  columns: { key: string; header: string; get: (r: T) => unknown }[],
): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows
    .map((r) => columns.map((c) => csvCell(c.get(r))).join(','))
    .join('\n');
  return head + '\n' + body + '\n';
}

/** Trigger a browser download for the given CSV text + filename. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build "name-YYYY-MM-DD.csv" */
export function csvFilename(name: string): string {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10);
  return `${name}-${stamp}.csv`;
}
