// Pure reporting over locally saved records. Figures are per currency — never mixed.
// These are summaries to help with bookkeeping and GST return preparation, not filings.

import type { DocumentRecord, Payment } from '../../types';
import type { Totals } from '../../services/calculations/calc';
import { DOC_META, PAYMENT_METHOD_LABEL, STATUS_LABEL, TREATMENT_LABEL, stateLabel, unitText } from '../../services/domain';
import { docSummary } from '../payments/payments';
import { fromMinor, toMinor } from '../../utils/money';
import type { Cell } from '../../utils/csv';

export interface ReportFilter {
  from: string; // yyyy-mm-dd or ''
  to: string;
  currency: string;
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  otherTaxMinor: number;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
}

export interface Report {
  currency: string;
  invoices: Bucket;
  creditNotesMinor: number;
  creditNoteCount: number;
  debitNotesMinor: number;
  debitNoteCount: number;
  netMinor: number; // invoices − credit notes + debit notes
  receivedMinor: number; // payments dated within the range
  byMonth: (Bucket & { receivedMinor: number })[];
  byClient: Bucket[];
  byRate: Bucket[]; // key = combined GST/tax rate; 'exempt' for zero-rated/exempt/non-GST value
}

const emptyBucket = (key: string, label: string): Bucket => ({
  key, label, count: 0, taxableMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, otherTaxMinor: 0, totalMinor: 0, paidMinor: 0, outstandingMinor: 0,
});

function addTaxes(b: Bucket, t: Totals) {
  for (const r of t.taxRows) {
    if (r.label === 'CGST') b.cgstMinor += r.taxMinor;
    else if (r.label === 'SGST') b.sgstMinor += r.taxMinor;
    else if (r.label === 'IGST') b.igstMinor += r.taxMinor;
    else b.otherTaxMinor += r.taxMinor;
  }
}

function addDoc(b: Bucket, t: Totals) {
  b.count++;
  b.taxableMinor += t.taxableMinor + t.chargesMinor;
  addTaxes(b, t);
  b.totalMinor += t.grandTotalMinor;
  b.paidMinor += Math.min(t.paidMinor, t.grandTotalMinor);
  b.outstandingMinor += Math.max(0, t.balanceMinor);
}

const inRange = (date: string, f: ReportFilter) => (!f.from || date >= f.from) && (!f.to || date <= f.to);

/** Finalised, non-cancelled documents of the given currency within the date range. */
export function reportDocuments(docs: DocumentRecord[], payments: Payment[], f: ReportFilter) {
  return docs
    .filter((d) => d.currency === f.currency && d.status !== 'draft' && inRange(d.issueDate, f))
    .map((d) => ({ d, ...docSummary(d, payments) }))
    .filter((x) => x.status !== 'cancelled');
}

export function buildReport(docs: DocumentRecord[], payments: Payment[], f: ReportFilter): Report {
  const rows = reportDocuments(docs, payments, f);
  const invoices = emptyBucket('invoices', 'Invoices');
  const months = new Map<string, Bucket & { receivedMinor: number }>();
  const clients = new Map<string, Bucket>();
  const rates = new Map<string, Bucket>();
  let credit = 0, creditCount = 0, debit = 0, debitCount = 0;

  const month = (key: string) => {
    let m = months.get(key);
    if (!m) months.set(key, (m = { ...emptyBucket(key, key), receivedMinor: 0 }));
    return m;
  };

  for (const { d, totals } of rows) {
    if (d.type === 'credit-note') { credit += totals.grandTotalMinor; creditCount++; continue; }
    if (d.type === 'debit-note') { debit += totals.grandTotalMinor; debitCount++; continue; }
    if (d.type !== 'invoice') continue;
    addDoc(invoices, totals);
    addDoc(month(d.issueDate.slice(0, 7)), totals);
    const ck = d.client.name.trim().toLowerCase() || '(no client)';
    if (!clients.has(ck)) clients.set(ck, emptyBucket(ck, d.client.name.trim() || '(no client)'));
    addDoc(clients.get(ck)!, totals);

    // Rate-wise summary: CGST and SGST halves are combined into the full rate.
    for (const r of totals.taxRows) {
      const full = r.label === 'CGST' || r.label === 'SGST' ? r.rate * 2 : r.rate;
      const key = String(full);
      if (!rates.has(key)) rates.set(key, emptyBucket(key, `${full}%`));
      const b = rates.get(key)!;
      if (r.label !== 'SGST') b.taxableMinor += r.taxableMinor; // count taxable once per line
      if (r.label === 'CGST') b.cgstMinor += r.taxMinor;
      else if (r.label === 'SGST') b.sgstMinor += r.taxMinor;
      else if (r.label === 'IGST') b.igstMinor += r.taxMinor;
      else b.otherTaxMinor += r.taxMinor;
    }
    // Taxable lines at 0% produce no tax rows; group them with non-taxable value.
    const zeroRateTaxable = totals.lines.filter((l) => l.treatment === 'taxable' && (l.taxRate === 0 || d.taxMode === 'none')).reduce((a, l) => a + l.taxableMinor, 0);
    const exempt = totals.nonTaxableMinor + zeroRateTaxable;
    if (exempt) {
      if (!rates.has('exempt')) rates.set('exempt', emptyBucket('exempt', 'Nil / zero-rated / exempt / non-GST'));
      rates.get('exempt')!.taxableMinor += exempt;
    }
  }

  let received = 0;
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const p of payments) {
    const d = byId.get(p.documentId);
    if (!d || p.currency !== f.currency || !inRange(p.date, f)) continue;
    const m = toMinor(p.amount, p.currency);
    received += m;
    month(p.date.slice(0, 7)).receivedMinor += m;
  }

  return {
    currency: f.currency,
    invoices,
    creditNotesMinor: credit,
    creditNoteCount: creditCount,
    debitNotesMinor: debit,
    debitNoteCount: debitCount,
    netMinor: invoices.totalMinor - credit + debit,
    receivedMinor: received,
    byMonth: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byClient: [...clients.values()].sort((a, b) => b.totalMinor - a.totalMinor),
    byRate: [...rates.values()].sort((a, b) => (a.key === 'exempt' ? -1 : b.key === 'exempt' ? 1 : Number(a.key) - Number(b.key))),
  };
}

// ---- CSV exports ---------------------------------------------------------------------------

const amt = (minor: number, cur: string) => fromMinor(minor, cur);

export function documentsCsv(docs: DocumentRecord[], payments: Payment[]): Cell[][] {
  const header = [
    'Type', 'Number', 'Status', 'Date', 'Due / valid until', 'Client', 'Client GSTIN', 'Place of supply', 'Currency', 'Taxable value',
    'CGST', 'SGST', 'IGST', 'Other tax', 'Grand total', 'Paid', 'Balance', 'Project', 'PO reference', 'Linked document', 'Custom fields',
  ];
  const rows = docs.map((d) => {
    const { totals, status } = docSummary(d, payments);
    const b = emptyBucket('', '');
    addTaxes(b, totals);
    return [
      DOC_META[d.type].label, d.number, STATUS_LABEL[status], d.issueDate, d.dueDate, d.client.name, d.client.gstin,
      d.placeOfSupply ? stateLabel(d.placeOfSupply) : '', d.currency, amt(totals.taxableMinor + totals.chargesMinor, d.currency),
      amt(b.cgstMinor, d.currency), amt(b.sgstMinor, d.currency), amt(b.igstMinor, d.currency), amt(b.otherTaxMinor, d.currency),
      amt(totals.grandTotalMinor, d.currency), amt(totals.paidMinor, d.currency), amt(totals.balanceMinor, d.currency),
      d.projectName, d.poReference, d.referenceNumber,
      (d.customFields ?? []).filter((x) => x.value.trim()).map((x) => `${x.label}: ${x.value}`).join('; '),
    ];
  });
  return [header, ...rows];
}

export function lineItemsCsv(docs: DocumentRecord[], payments: Payment[]): Cell[][] {
  const header = [
    'Type', 'Number', 'Date', 'Client', 'Client GSTIN', 'Place of supply', 'Description', 'SAC/HSN', 'Quantity', 'Unit', 'Rate',
    'Line discount', 'Taxable value (after all discounts)', 'Tax treatment', 'Tax rate %', 'Tax amount', 'Currency',
  ];
  const rows: Cell[][] = [];
  for (const d of docs) {
    const { totals } = docSummary(d, payments);
    d.items.forEach((it, i) => {
      const l = totals.lines[i];
      rows.push([
        DOC_META[d.type].label, d.number, d.issueDate, d.client.name, d.client.gstin, d.placeOfSupply ? stateLabel(d.placeOfSupply) : '',
        it.description.replace(/\s*\n\s*/g, ' / '), it.serviceCode, it.quantity, unitText(it.unit, it.customUnit), it.rate,
        amt(l.lineDiscountMinor, d.currency), amt(l.taxableMinor, d.currency), TREATMENT_LABEL[l.treatment],
        l.treatment === 'taxable' ? l.taxRate : 0, amt(l.taxMinor, d.currency), d.currency,
      ]);
    });
  }
  return [header, ...rows];
}

export function paymentsCsv(payments: Payment[], docs: DocumentRecord[]): Cell[][] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const header = ['Receipt', 'Date', 'Invoice', 'Client', 'Method', 'Reference', 'Amount', 'Currency', 'Notes'];
  return [
    header,
    ...[...payments].sort((a, b) => a.date.localeCompare(b.date)).map((p) => {
      const d = byId.get(p.documentId);
      return [p.receiptNumber, p.date, d?.number ?? '(deleted)', d?.client.name ?? '', p.method === 'custom' ? p.customMethod : PAYMENT_METHOD_LABEL[p.method], p.reference, p.amount, p.currency, p.notes];
    }),
  ];
}

export function summaryCsv(r: Report): Cell[][] {
  const c = r.currency;
  const row = (b: Bucket, extra: Cell[] = []) => [
    b.label, b.count, amt(b.taxableMinor, c), amt(b.cgstMinor, c), amt(b.sgstMinor, c), amt(b.igstMinor, c), amt(b.otherTaxMinor, c),
    amt(b.totalMinor, c), amt(b.paidMinor, c), amt(b.outstandingMinor, c), ...extra,
  ];
  const head = ['Taxable value', 'CGST', 'SGST', 'IGST', 'Other tax', 'Total', 'Paid', 'Outstanding'];
  return [
    [`Summary (${c})`],
    ['Period', 'Invoices', ...head, 'Received in period'],
    ...r.byMonth.map((m) => row(m, [amt(m.receivedMinor, c)])),
    row({ ...r.invoices, label: 'All' }, [amt(r.receivedMinor, c)]),
    [],
    ['Credit notes', r.creditNoteCount, amt(r.creditNotesMinor, c)],
    ['Debit notes', r.debitNoteCount, amt(r.debitNotesMinor, c)],
    ['Net (invoices − credit + debit)', '', amt(r.netMinor, c)],
    [],
    ['Tax rate', 'Invoices', ...head.slice(0, 5)],
    ...r.byRate.map((b) => [b.label, '', amt(b.taxableMinor, c), amt(b.cgstMinor, c), amt(b.sgstMinor, c), amt(b.igstMinor, c), amt(b.otherTaxMinor, c)]),
    [],
    ['Client', 'Invoices', ...head],
    ...r.byClient.map((b) => row(b)),
  ];
}
