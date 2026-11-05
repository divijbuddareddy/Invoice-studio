import { describe, expect, it } from 'vitest';
import { currencyDigits, formatMoney, formatMoneyCode, parseAmount, toMinor } from './money';
import { amountInWords } from './words';
import { addMonths, isGstin, isIfsc, isPan, pdfFileName } from './misc';
import { formatNumbering, documentTitle, effectiveStatus, newDocument, defaultSettings, emptyCompany, suggestTaxMode } from '../services/domain';
import { pdfSafe } from '../services/pdf/pdf';

describe('money', () => {
  it('formats INR, USD, EUR, GBP with code and decimals', () => {
    expect(formatMoneyCode(12345678, 'INR')).toBe('INR 1,23,456.78');
    expect(formatMoneyCode(12345678, 'USD')).toBe('USD 123,456.78');
    expect(formatMoneyCode(100, 'EUR')).toBe('EUR 1.00');
    expect(formatMoneyCode(-250, 'GBP')).toBe('-GBP 2.50');
    expect(formatMoney(150000, 'INR')).toContain('1,500.00');
    expect(formatMoney(150000, 'USD')).toBe('$1,500.00');
    expect(formatMoney(150000, 'GBP')).toBe('£1,500.00');
    expect(formatMoney(150000, 'EUR')).toBe('€1,500.00');
  });
  it('knows minor units', () => {
    expect(currencyDigits('INR')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(toMinor(1.005, 'USD')).toBe(101);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('amountInWords', () => {
  it('uses lakh/crore for INR', () => {
    expect(amountInWords(12345650, 'INR', 2)).toBe('Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only');
    expect(amountInWords(1000000000, 'INR', 2)).toBe('Rupees One Crore Only');
  });
  it('uses million for other currencies', () => {
    expect(amountInWords(123456700, 'USD', 2)).toBe('US Dollars One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Only');
  });
});

describe('validation & formatting', () => {
  it('validates GSTIN, PAN, IFSC structure', () => {
    expect(isGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isPan('AAPFU0939F')).toBe(true);
    expect(isPan('1234')).toBe(false);
    expect(isIfsc('HDFC0001234')).toBe(true);
    expect(isIfsc('HDFC1001234')).toBe(false);
  });
  it('builds sanitised filenames', () => {
    expect(pdfFileName('Invoice', 'INV-2026-001', 'Acme Corp / Pvt. Ltd.')).toBe('Invoice_INV-2026-001_Acme_Corp_Pvt._Ltd.pdf');
    expect(pdfFileName('Invoice', 'INV/1', '')).toBe('Invoice_INV_1.pdf');
  });
  it('formats numbering with year tokens', () => {
    expect(formatNumbering({ prefix: 'INV-{YYYY}-', next: 7, padding: 3 }, '2026-04-01')).toBe('INV-2026-007');
    expect(formatNumbering({ prefix: 'Q{YY}/', next: 12, padding: 0 }, '2026-04-01')).toBe('Q26/12');
  });
  it('clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
  it('maps unsupported PDF glyphs', () => {
    expect(pdfSafe('₹100 – “ok”')).toBe('Rs.100 - "ok"');
  });
  it('suggests tax mode from states', () => {
    expect(suggestTaxMode('27', '27')).toBe('intra');
    expect(suggestTaxMode('27', '29')).toBe('inter');
    expect(suggestTaxMode('', '29')).toBeNull();
  });
});

describe('document titles & status', () => {
  const s = defaultSettings();
  const co = { ...emptyCompany(), gstin: '27AAPFU0939F1ZV' };
  it('never labels quotations/proformas as tax invoices', () => {
    expect(documentTitle(newDocument('invoice', s, co))).toBe('TAX INVOICE');
    expect(documentTitle(newDocument('quotation', s, co))).toBe('QUOTATION');
    expect(documentTitle(newDocument('proforma', s, co))).toBe('PROFORMA INVOICE');
    expect(documentTitle({ ...newDocument('invoice', s, co), taxMode: 'none' })).toBe('INVOICE');
    expect(documentTitle(newDocument('credit-note', s, co))).toBe('CREDIT NOTE');
    expect(documentTitle(newDocument('debit-note', s, co))).toBe('DEBIT NOTE');
    expect(documentTitle(newDocument('purchase-order', s, co))).toBe('PURCHASE ORDER');
  });
  it('derives invoice status from balance and due date', () => {
    const d = { ...newDocument('invoice', s, co), status: 'unpaid' as const, dueDate: '2026-01-10' };
    expect(effectiveStatus(d, 1000, 0, '2026-01-05')).toBe('unpaid');
    expect(effectiveStatus(d, 500, 500, '2026-01-05')).toBe('partially_paid');
    expect(effectiveStatus(d, 0, 1000, '2026-01-05')).toBe('paid');
    expect(effectiveStatus(d, 1000, 0, '2026-02-01')).toBe('overdue');
    expect(effectiveStatus({ ...d, statusOverride: 'cancelled' }, 1000, 0)).toBe('cancelled');
    expect(effectiveStatus({ ...d, status: 'draft' }, 1000, 0)).toBe('draft');
  });
});
