import { describe, expect, it } from 'vitest';
import { buildDocumentPdf, buildReceiptPdf } from './pdf';
import { DOC_TYPES, type DocumentRecord, type Payment, type TemplateId } from '../../types';
import { defaultSettings, emptyCompany, emptyLine, newDocument } from '../domain';

const settings = defaultSettings();
const company = {
  ...emptyCompany(),
  legalName: 'Very Long Company Name Software Solutions and Artificial Intelligence Consulting Private Limited',
  gstin: '27AAPFU0939F1ZV', upiId: 'acme@okbank', bank: { accountHolder: 'Acme', bankName: 'HDFC', accountNumber: '123', ifsc: 'HDFC0001234', branch: 'Pune', swift: '' },
};

function doc(type: DocumentRecord['type'], rows: number): DocumentRecord {
  const d = newDocument(type, settings, company);
  d.client.name = 'Client — “Global” Ltd';
  d.items = Array.from({ length: rows }, (_, i) =>
    emptyLine(18, { description: `Service ${i + 1}: ${'Long description of backend API work with integrations. '.repeat(i % 3 + 1)}`, quantity: 1.5, unit: 'hour', rate: 1500 + i, serviceCode: '998314' }),
  );
  d.invoiceDiscountValue = 5;
  d.charges = [{ id: 'c', label: 'Travel', amount: 1000, taxRate: 0 }];
  return d;
}

const pageCount = (pdf: { getNumberOfPages(): number }) => pdf.getNumberOfPages();

describe('PDF generation', () => {
  it('generates every document type with the right filename', () => {
    for (const t of DOC_TYPES) {
      const r = buildDocumentPdf(doc(t, 3), [], settings.branding);
      expect(r.filename.endsWith('.pdf')).toBe(true);
      expect(pageCount(r.pdf)).toBeGreaterThanOrEqual(1);
      expect(r.warnings).toEqual([]);
    }
  });

  it('produces multi-page output for many rows across all templates', () => {
    for (const tpl of ['corporate', 'minimal', 'modern', 'executive'] as TemplateId[]) {
      const r = buildDocumentPdf(doc('invoice', 80), [], settings.branding, tpl);
      expect(pageCount(r.pdf)).toBeGreaterThan(2);
    }
  });

  it('templates produce genuinely different output', () => {
    const d = doc('invoice', 2);
    const outs = (['corporate', 'minimal', 'modern', 'executive'] as TemplateId[]).map((t) =>
      buildDocumentPdf(d, [], settings.branding, t).pdf.output().replace(/\/CreationDate.*|\/ID.*/g, ''),
    );
    expect(new Set(outs).size).toBe(4);
  });

  it('generates a receipt', () => {
    const inv = { ...doc('invoice', 2), status: 'unpaid' as const };
    const p: Payment = { id: 'p1', documentId: inv.id, receiptNumber: 'RCPT-1', date: '2026-01-01', amount: 100, currency: 'INR', method: 'upi', customMethod: '', reference: 'UTR1', notes: '', createdAt: '' };
    const r = buildReceiptPdf(p, inv, [p], settings.branding);
    expect(r.filename).toMatch(/^Receipt_RCPT-1_/);
  });
});
