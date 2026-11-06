import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDocumentPdf, documentMeta } from './pdf';
import { setUnicodeFontData, unicodeFontReady } from './fonts';
import { defaultSettings, emptyCompany, emptyLine, newDocument } from '../domain';

const font = (f: string) => readFileSync(resolve(__dirname, '../../../public/fonts', f)).toString('base64');

describe('Unicode font & custom fields', () => {
  afterAll(() => setUnicodeFontData(null));

  const settings = defaultSettings();
  settings.customFields = [
    { id: 'cf1', label: 'Contract ID', docTypes: ['invoice'], defaultValue: 'MSA-42', showOnPdf: true },
    { id: 'cf2', label: 'Internal cost centre', docTypes: ['invoice'], defaultValue: 'CC-9', showOnPdf: false },
    { id: 'cf3', label: 'Quote only', docTypes: ['quotation'], defaultValue: 'x', showOnPdf: true },
  ];

  it('adds configured custom fields to new documents of the right type', () => {
    const d = newDocument('invoice', settings, emptyCompany());
    expect(d.customFields?.map((f) => f.label)).toEqual(['Contract ID', 'Internal cost centre']);
    expect(newDocument('quotation', settings, emptyCompany()).customFields?.map((f) => f.label)).toEqual(['Quote only']);
  });

  it('prints only custom fields marked for PDF', () => {
    const meta = documentMeta(newDocument('invoice', settings, emptyCompany()));
    expect(meta).toContainEqual(['Contract ID', 'MSA-42']);
    expect(meta.find(([l]) => l === 'Internal cost centre')).toBeUndefined();
  });

  it('falls back to Helvetica with a warning when the Unicode font is not loaded', () => {
    const b = { ...settings.branding, font: 'noto' as const };
    const r = buildDocumentPdf(newDocument('invoice', settings, emptyCompany()), [], b);
    expect(r.warnings[0]).toMatch(/Unicode font is not loaded/);
  });

  it('embeds Noto Sans and renders ₹ and Unicode text when loaded', () => {
    setUnicodeFontData({ normal: font('NotoSans-Regular.ttf'), bold: font('NotoSans-Bold.ttf'), italic: font('NotoSans-Italic.ttf') });
    expect(unicodeFontReady()).toBe(true);
    const d = newDocument('invoice', settings, { ...emptyCompany(), legalName: 'Zoë Café Ltd' });
    d.client.name = 'Ünïcödé Client — “Ltd”';
    d.items = [emptyLine(18, { description: 'Développement — ₹ pricing', rate: 1000 })];
    const r = buildDocumentPdf(d, [], { ...settings.branding, font: 'noto' });
    expect(r.warnings).toEqual([]);
    const fonts = r.pdf.getFontList();
    expect(Object.keys(fonts)).toContain('NotoSans');
    const raw = r.pdf.output();
    expect(raw).toContain('NotoSans');
  });

  it('uses the Unicode font for INR documents (₹ symbol) even when a built-in font is selected', () => {
    expect(unicodeFontReady()).toBe(true);
    const inr = newDocument('invoice', settings, emptyCompany());
    inr.currency = 'INR';
    inr.items = [emptyLine(18, { description: 'Service', rate: 1000 })];
    const r = buildDocumentPdf(inr, [], { ...settings.branding, font: 'helvetica' });
    expect(r.warnings).toEqual([]);
    expect(r.pdf.output()).toContain('NotoSans');

    const usd = { ...inr, currency: 'USD' };
    expect(buildDocumentPdf(usd, [], { ...settings.branding, font: 'helvetica' }).pdf.output()).not.toContain('NotoSans');
  });
});
