import { describe, expect, it } from 'vitest';
import { buildReport, documentsCsv, lineItemsCsv, paymentsCsv, summaryCsv } from './reports';
import { defaultSettings, emptyCompany, emptyLine, newDocument } from '../../services/domain';
import type { DocumentRecord, Payment } from '../../types';
import { csvCell, toCsv } from '../../utils/csv';
import { mailtoUrl, waPhone, whatsappUrl } from '../../utils/share';

const s = defaultSettings();
function inv(p: Partial<DocumentRecord>, rate = 1000, taxRate = 18): DocumentRecord {
  return { ...newDocument('invoice', s, emptyCompany()), status: 'unpaid', items: [emptyLine(taxRate, { description: 'Work', rate, serviceCode: '998314' })], ...p };
}
const pay = (documentId: string, amount: number, date: string): Payment => ({
  id: `${documentId}-${amount}`, documentId, receiptNumber: 'R', date, amount, currency: 'INR', method: 'upi', customMethod: '', reference: '', notes: '', createdAt: '',
});

describe('reports', () => {
  const a = inv({ id: 'a', issueDate: '2026-04-10', client: { ...newDocument('invoice', s, emptyCompany()).client, name: 'Acme' } }); // intra 18%
  const b = inv({ id: 'b', issueDate: '2026-05-02', taxMode: 'inter' }, 2000, 5);
  const draft = inv({ id: 'c', issueDate: '2026-05-03', status: 'draft' });
  const cancelled = inv({ id: 'd', issueDate: '2026-05-03', status: 'cancelled' });
  const usd = inv({ id: 'e', issueDate: '2026-05-03', currency: 'USD' });
  const credit = { ...newDocument('credit-note', s, emptyCompany()), id: 'cn', status: 'issued' as const, issueDate: '2026-05-04', items: [emptyLine(18, { description: 'Refund', rate: 100 })] };
  const old = inv({ id: 'f', issueDate: '2025-12-01' });
  const docs = [a, b, draft, cancelled, usd, credit, old];
  const payments = [pay('a', 500, '2026-04-20'), pay('b', 2100, '2026-05-10')];
  const r = buildReport(docs, payments, { from: '2026-04-01', to: '2026-05-31', currency: 'INR' });

  it('includes only finalised, non-cancelled documents in range and currency', () => {
    expect(r.invoices.count).toBe(2);
    expect(r.invoices.taxableMinor).toBe(100000 + 200000);
    expect(r.invoices.cgstMinor).toBe(9000);
    expect(r.invoices.sgstMinor).toBe(9000);
    expect(r.invoices.igstMinor).toBe(10000);
    expect(r.invoices.totalMinor).toBe(118000 + 210000);
  });
  it('tracks payments, outstanding, notes and net', () => {
    expect(r.invoices.paidMinor).toBe(50000 + 210000);
    expect(r.invoices.outstandingMinor).toBe(68000);
    expect(r.receivedMinor).toBe(260000);
    expect(r.creditNotesMinor).toBe(11800);
    expect(r.netMinor).toBe(328000 - 11800);
  });
  it('groups by month, client and full tax rate', () => {
    expect(r.byMonth.map((m) => [m.key, m.count, m.receivedMinor])).toEqual([['2026-04', 1, 50000], ['2026-05', 1, 210000]]);
    expect(r.byClient[0].totalMinor).toBe(210000);
    expect(r.byRate.map((x) => [x.label, x.taxableMinor, x.cgstMinor + x.sgstMinor + x.igstMinor])).toEqual([['5%', 200000, 10000], ['18%', 100000, 18000]]);
  });
  it('builds CSV exports', () => {
    const d = documentsCsv([a], payments);
    expect(d[0]).toContain('CGST');
    expect(d[1]).toEqual(expect.arrayContaining(['Invoice', a.number, 'Partially Paid', 1000, 90, 1180, 500, 680]));
    const l = lineItemsCsv([a, b], payments);
    expect(l).toHaveLength(3);
    expect(l[2]).toEqual(expect.arrayContaining(['998314', 5, 100]));
    expect(paymentsCsv(payments, docs)[1]).toEqual(expect.arrayContaining([a.number, 'UPI', 500]));
    expect(toCsv(summaryCsv(r))).toContain('2026-05');
  });
});

describe('csv', () => {
  it('quotes and escapes', () => {
    expect(toCsv([['a,b', 'say "hi"', 'line\nbreak', 3.5, null]])).toBe('"a,b","say ""hi""","line\nbreak",3.5,');
  });
  it('neutralises spreadsheet formulas in text but not numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('share links', () => {
  it('builds mailto and WhatsApp links', () => {
    expect(mailtoUrl('a@b.com', 'Invoice 1', 'Hi & bye')).toBe('mailto:a%40b.com?subject=Invoice%201&body=Hi%20%26%20bye');
    expect(waPhone('098765 43210')).toBe('919876543210');
    expect(waPhone('+44 7700 900123')).toBe('447700900123');
    expect(whatsappUrl('9876543210', 'Hello')).toBe('https://wa.me/919876543210?text=Hello');
  });
});
