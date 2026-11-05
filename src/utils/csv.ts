// CSV builder (RFC 4180 quoting) with spreadsheet formula-injection protection.

export type Cell = string | number | boolean | null | undefined;

const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  // Text starting with a formula trigger is prefixed so Excel/Sheets treat it as text, not a formula.
  const s = FORMULA.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** CSV as a Blob with a UTF-8 BOM so Excel opens non-ASCII text (₹, names) correctly. */
export function csvBlob(rows: Cell[][]): Blob {
  return new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
}
