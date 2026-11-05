// Small shared helpers: ids, dates, filenames, validation.

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local date as yyyy-mm-dd. */
export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

/** Add months, clamping to the end of month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: string, months: number, anchorDay?: number): string {
  const d = parseDate(s);
  const day = anchorDay ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return todayStr(target);
}

export function formatDate(s: string): string {
  if (!s) return '';
  const d = parseDate(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Safe filesystem name: Invoice_INV-2026-001_Acme_Corp.pdf */
export function sanitizeFilePart(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.-]+|[_.-]+$/g, '')
      .slice(0, 60) || 'Untitled'
  );
}

export function pdfFileName(title: string, number: string, client: string): string {
  return `${[title, number, client].filter(Boolean).map(sanitizeFilePart).join('_')}.pdf`;
}

// ---- validation (basic structural checks only, no government verification) ----
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const isGstin = (s: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s.trim().toUpperCase());
export const isPan = (s: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s.trim().toUpperCase());
export const isIfsc = (s: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.trim().toUpperCase());
export const isPhone = (s: string) => /^[+()\d\s-]{6,20}$/.test(s.trim());
export const isUrl = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s.trim());
export const isUpi = (s: string) => /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(s.trim());
export const isHexColor = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

/** Returns an error message or '' — optional fields are valid when empty. */
export function checkOptional(value: string, test: (s: string) => boolean, message: string): string {
  return value.trim() && !test(value) ? message : '';
}

export function addressLines(a: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string }): string[] {
  const cityLine = [a.city, a.state, a.postalCode].filter((x) => x && x.trim()).join(', ');
  return [a.line1, a.line2, cityLine, a.country].filter((x) => x && x.trim());
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
