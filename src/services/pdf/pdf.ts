// Client-side PDF generation (jsPDF + AutoTable). Produces real vector PDFs — never screenshots.
// Four templates differ in header treatment, colour usage, table style and totals presentation.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import type { Branding, CompanyProfile, DocumentRecord, Payment, StoredImage, TemplateId } from '../../types';
import { calculateTotals, type Totals } from '../calculations/calc';
import { DOC_META, PAYMENT_METHOD_LABEL, TREATMENT_LABEL, documentTitle, stateLabel, termsLabel, unitText } from '../domain';
import { paymentsFor, sumPayments } from '../../features/payments/payments';
import { currencyDigits, formatMoney, formatMoneyCode, formatNumber, toMinor } from '../../utils/money';
import { UNICODE_FONT, registerUnicodeFont } from './fonts';
import { amountInWords } from '../../utils/words';
import { addressLines, formatDate, pdfFileName } from '../../utils/misc';

type RGB = [number, number, number];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // margin
const BOTTOM = PAGE_H - 20; // content limit above footer
const TEXT: RGB = [33, 37, 41];
const MUTED: RGB = [105, 114, 125];
const RULE: RGB = [222, 226, 231];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [27, 58, 135];
}
const tint = (c: RGB, amount: number): RGB => c.map((v) => Math.round(v + (255 - v) * amount)) as RGB;

/** Built-in PDF fonts use WinAnsi encoding — map common Unicode and drop unsupported glyphs. */
export function pdfSafe(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●▪]/g, '-')
    .replace(/₹/g, 'Rs.')
    .replace(/€/g, 'EUR')
    .replace(/\s/g, (ch) => (ch === '\n' ? '\n' : ' '))
    .replace(/\t/g, '    ')
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, '?');
}

interface Theme {
  id: TemplateId;
  primary: RGB;
  secondary: RGB;
  accent: RGB; // labels and highlights
  titleColor: RGB;
  font: string;
}

interface Ctx {
  pdf: jsPDF;
  y: number;
  theme: Theme;
  branding: Branding;
  warnings: string[];
  /** True when the bundled Unicode font is active: text is kept as-is and currency symbols are used. */
  unicode: boolean;
}

/** Text for the PDF: untouched (except whitespace) with the Unicode font, WinAnsi-mapped otherwise. */
function safe(c: Ctx, input: string | undefined | null): string {
  if (!input) return '';
  return c.unicode ? input.replace(/\s/g, (ch) => (ch === '\n' ? '\n' : ' ')) : pdfSafe(input);
}

/** Money with symbol (₹1,000.00) under the Unicode font, ISO code (INR 1,000.00) with built-in fonts. */
function money(c: Ctx, minor: number, currency: string): string {
  return c.unicode ? formatMoney(minor, currency) : formatMoneyCode(minor, currency);
}

function makeTheme(template: TemplateId, b: Branding, font: string): Theme {
  const primary = hexToRgb(b.primaryColor);
  const secondary = hexToRgb(b.secondaryColor);
  switch (template) {
    case 'minimal':
      return { id: template, primary: [40, 40, 40], secondary: [120, 120, 120], accent: [90, 90, 90], titleColor: [25, 25, 25], font };
    case 'modern':
      return { id: template, primary, secondary, accent: secondary, titleColor: secondary, font };
    case 'executive':
      return { id: template, primary, secondary, accent: primary, titleColor: [255, 255, 255], font };
    default:
      return { id: 'corporate', primary, secondary, accent: secondary, titleColor: primary, font };
  }
}

/** Create the drawing context, registering the Unicode font when selected and available. */
function makeCtx(pdf: jsPDF, template: TemplateId, branding: Branding): Ctx {
  const wantsUnicode = branding.font === 'noto';
  const unicode = wantsUnicode && registerUnicodeFont(pdf);
  const fontName = unicode ? UNICODE_FONT : wantsUnicode ? 'helvetica' : branding.font;
  const warnings = wantsUnicode && !unicode ? ['The Unicode font is not loaded yet, so Helvetica was used for this PDF.'] : [];
  return { pdf, y: 15, theme: makeTheme(template, branding, fontName), branding, warnings, unicode };
}

// ---- primitives -------------------------------------------------------------------

function font(c: Ctx, style: 'normal' | 'bold' | 'italic' = 'normal', size = 9, color: RGB = TEXT) {
  c.pdf.setFont(c.theme.font, style);
  c.pdf.setFontSize(size);
  c.pdf.setTextColor(...color);
}

function ensure(c: Ctx, h: number) {
  if (c.y + h > BOTTOM) {
    c.pdf.addPage();
    c.y = 20;
  }
}

function lineHeight(size: number) {
  return size * 0.3528 * 1.35; // pt → mm × line spacing
}

/** Draw wrapped text with page breaks; returns height used. */
function para(c: Ctx, text: string, x: number, width: number, size = 8.5, color: RGB = TEXT, style: 'normal' | 'bold' | 'italic' = 'normal') {
  font(c, style, size, color);
  const lines: string[] = c.pdf.splitTextToSize(safe(c, text), width);
  const lh = lineHeight(size);
  for (const ln of lines) {
    ensure(c, lh);
    c.pdf.text(ln, x, c.y + lh * 0.75);
    c.y += lh;
  }
}

function fit(img: StoredImage, maxW: number, maxH: number) {
  const r = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * r, h: img.height * r };
}

function drawImage(c: Ctx, img: StoredImage | null | undefined, x: number, y: number, w: number, h: number, what: string): boolean {
  if (!img?.dataUrl) return false;
  try {
    const format = img.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    c.pdf.addImage(img.dataUrl, format, x, y, w, h, undefined, 'FAST');
    return true;
  } catch {
    c.warnings.push(`The ${what} image could not be embedded and was skipped.`);
    return false;
  }
}

function sectionLabel(c: Ctx, text: string, x: number, y: number) {
  font(c, 'bold', 7.5, c.theme.accent);
  c.pdf.text(safe(c, text.toUpperCase()), x, y);
}

// ---- header ---------------------------------------------------------------------------

function companyLines(co: CompanyProfile): string[] {
  const out = [...addressLines(co.address)];
  const ids = [co.gstin && `GSTIN: ${co.gstin}`, co.pan && `PAN: ${co.pan}`].filter(Boolean).join('   ');
  if (ids) out.push(ids);
  if (co.cin) out.push(`CIN: ${co.cin}`);
  const contact = [co.email, co.phone].filter(Boolean).join('  |  ');
  if (contact) out.push(contact);
  if (co.website) out.push(co.website);
  return out;
}

function drawHeader(c: Ctx, co: CompanyProfile, title: string, meta: [string, string][]) {
  const { pdf, theme } = c;
  const exec = theme.id === 'executive';
  const bandH = 34;
  let top = theme.id === 'minimal' ? 16 : 14;
  if (exec) {
    pdf.setFillColor(...theme.primary);
    pdf.rect(0, 0, PAGE_W, bandH, 'F');
    pdf.setFillColor(...theme.secondary);
    pdf.rect(0, bandH, PAGE_W, 1.2, 'F');
    top = 8;
  }

  // Logo + title row
  const align = c.branding.logoAlign;
  let logoH = 0;
  if (co.logo) {
    const { w, h } = fit(co.logo, 48, exec ? 18 : 20);
    const x = align === 'right' ? PAGE_W - M - w : align === 'center' ? (PAGE_W - w) / 2 : M;
    if (exec) {
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x - 2, top - 2, w + 4, h + 4, 1.5, 1.5, 'F');
    }
    if (drawImage(c, co.logo, x, top, w, h, 'logo')) logoH = h;
  }
  const titleRight = align !== 'right';
  const titleX = titleRight ? PAGE_W - M : M;
  const titleOpts = { align: titleRight ? ('right' as const) : ('left' as const) };
  if (theme.id === 'minimal') {
    // Letter-spaced title; jsPDF's right-align ignores char spacing, so position manually.
    font(c, 'normal', 22, theme.titleColor);
    const spacing = 0.8;
    const w = pdf.getTextWidth(title) + spacing * title.length;
    pdf.setCharSpace(spacing);
    pdf.text(title, titleRight ? titleX - w : titleX, top + 8);
    pdf.setCharSpace(0);
  } else {
    font(c, 'bold', exec ? 22 : 20, theme.titleColor);
    pdf.text(title, titleX, top + 8, titleOpts);
  }
  if (exec) {
    font(c, 'normal', 9, [220, 228, 245]);
    pdf.text(safe(c, meta[0]?.[1] ?? ''), titleX, top + 15, titleOpts);
  }
  if (!logoH) {
    // No logo: show company name prominently in place of the logo.
    font(c, 'bold', 14, exec ? [255, 255, 255] : theme.primary);
    const name = pdf.splitTextToSize(safe(c, co.legalName || 'Your Company'), 95)[0];
    pdf.text(name, titleRight ? M : PAGE_W - M, top + 8, { align: titleRight ? 'left' : 'right' });
  }

  c.y = exec ? bandH + 7 : Math.max(top + logoH, top + 12) + 4;

  // Company (left) and metadata (right)
  const startY = c.y;
  let ly = startY;
  // Without a logo the name is already shown large in the header row; don't repeat it
  // unless it was too long to fit there on one line.
  font(c, 'bold', 14);
  const nameFitsHeader = (pdf.splitTextToSize(safe(c, co.legalName), 95) as string[]).length <= 1;
  if (logoH || !nameFitsHeader) {
    font(c, 'bold', 11, TEXT);
    const nameLines: string[] = pdf.splitTextToSize(safe(c, co.legalName || 'Company name not set'), 100);
    for (const l of nameLines) {
      pdf.text(l, M, ly + 4);
      ly += 5;
    }
  }
  font(c, 'normal', 8.5, MUTED);
  for (const l of companyLines(co)) {
    const wrapped: string[] = pdf.splitTextToSize(safe(c, l), 100);
    for (const w of wrapped) {
      pdf.text(w, M, ly + 3.5);
      ly += 4;
    }
  }

  const metaW = 78;
  const mx = PAGE_W - M - metaW;
  const rowH = 5;
  const metaH = meta.length * rowH + 4;
  if (theme.id === 'modern' || theme.id === 'executive') {
    pdf.setFillColor(...tint(theme.id === 'modern' ? theme.secondary : theme.primary, 0.92));
    pdf.roundedRect(mx - 3, startY - 1, metaW + 3, metaH, 2, 2, 'F');
  }
  let my = startY + 3.5;
  for (const [label, value] of meta) {
    font(c, 'normal', 8.5, MUTED);
    pdf.text(safe(c, label), mx, my);
    font(c, 'bold', 8.5, TEXT);
    const v: string = pdf.splitTextToSize(safe(c, value), metaW - 30)[0] ?? '';
    pdf.text(v, PAGE_W - M - 2, my, { align: 'right' });
    my += rowH;
  }
  c.y = Math.max(ly, startY + metaH) + 4;
  if (theme.id === 'corporate' || theme.id === 'minimal') {
    pdf.setDrawColor(...(theme.id === 'corporate' ? theme.primary : RULE));
    pdf.setLineWidth(theme.id === 'corporate' ? 0.5 : 0.2);
    pdf.line(M, c.y, PAGE_W - M, c.y);
  }
  c.y += 6;
}

// ---- parties ------------------------------------------------------------------------------

function partyBlock(c: Ctx, label: string, lines: { text: string; bold?: boolean }[], x: number, width: number, y: number): number {
  const { pdf, theme } = c;
  // measure
  let h = 6;
  const wrapped = lines.map((l) => {
    font(c, l.bold ? 'bold' : 'normal', l.bold ? 10 : 8.5);
    const w: string[] = pdf.splitTextToSize(safe(c, l.text), width - (theme.id === 'modern' ? 6 : 0));
    h += w.length * (l.bold ? 5 : 4);
    return { w, bold: l.bold };
  });
  const pad = theme.id === 'modern' ? 3 : 0;
  if (theme.id === 'modern') {
    pdf.setFillColor(...tint(theme.secondary, 0.93));
    pdf.roundedRect(x, y - 1, width, h + 3, 2, 2, 'F');
  }
  sectionLabel(c, label, x + pad, y + 3.5);
  let yy = y + 8;
  for (const { w, bold } of wrapped) {
    font(c, bold ? 'bold' : 'normal', bold ? 10 : 8.5, bold ? TEXT : MUTED);
    for (const s of w) {
      pdf.text(s, x + pad, yy + (bold ? 0.5 : 0));
      yy += bold ? 5 : 4;
    }
  }
  return h + 3;
}

function clientLines(doc: DocumentRecord): { text: string; bold?: boolean }[] {
  const cl = doc.client;
  const out: { text: string; bold?: boolean }[] = [{ text: cl.name || '-', bold: true }];
  if (cl.contactPerson) out.push({ text: `Attn: ${cl.contactPerson}` });
  addressLines(cl.billingAddress).forEach((t) => out.push({ text: t }));
  const ids = [cl.gstin && `GSTIN: ${cl.gstin}`, cl.pan && `PAN: ${cl.pan}`].filter(Boolean).join('   ');
  if (ids) out.push({ text: ids });
  const contact = [cl.email, cl.phone].filter(Boolean).join('  |  ');
  if (contact) out.push({ text: contact });
  return out;
}

function drawParties(c: Ctx, doc: DocumentRecord) {
  const colW = (PAGE_W - 2 * M - 8) / 2;
  const y = c.y;
  const meta = DOC_META[doc.type];
  const leftH = partyBlock(c, meta.partyLabel, clientLines(doc), M, colW, y);
  let rightH = 0;
  const rx = M + colW + 8;
  if (doc.type === 'purchase-order' && doc.deliveryAddress.trim()) {
    rightH = partyBlock(c, 'Deliver To', doc.deliveryAddress.split('\n').map((t) => ({ text: t })), rx, colW, y);
  } else {
    const ship = addressLines(doc.client.shippingAddress);
    const bill = addressLines(doc.client.billingAddress);
    if (ship.length && ship.join('|') !== bill.join('|')) {
      rightH = partyBlock(c, 'Ship To', [{ text: doc.client.name, bold: true }, ...ship.map((t) => ({ text: t }))], rx, colW, y);
    }
  }
  c.y = y + Math.max(leftH, rightH) + 4;

  // Linked-document details
  const extra: [string, string][] = [];
  if ((doc.type === 'credit-note' || doc.type === 'debit-note') && (doc.referenceNumber || doc.reason)) {
    if (doc.referenceNumber) extra.push(['Original invoice', doc.referenceNumber]);
    if (doc.reason) extra.push([doc.type === 'credit-note' ? 'Reason for credit' : 'Reason for debit', doc.reason]);
  }
  if (doc.type === 'purchase-order' && doc.deliveryTerms) extra.push(['Delivery terms', doc.deliveryTerms]);
  for (const [label, value] of extra) {
    ensure(c, 6);
    font(c, 'bold', 8.5, TEXT);
    c.pdf.text(`${safe(c, label)}:`, M, c.y + 3);
    const lw = c.pdf.getTextWidth(`${safe(c, label)}: `);
    const yStart = c.y;
    para(c, value, M + lw + 1, PAGE_W - 2 * M - lw - 1, 8.5, TEXT);
    if (c.y === yStart) c.y += 4;
    c.y += 1;
  }
  if (extra.length) c.y += 3;
}

// ---- items table ----------------------------------------------------------------------------

function drawItems(c: Ctx, doc: DocumentRecord, totals: Totals) {
  const { pdf, theme } = c;
  const hasCode = doc.items.some((i) => i.serviceCode.trim());
  const hasDisc = totals.lines.some((l) => l.lineDiscountMinor > 0);
  const hasTax = doc.taxMode !== 'none';
  const cur = doc.currency;

  const head = ['#', 'Description', ...(hasCode ? ['SAC/HSN'] : []), 'Qty', `Rate`, ...(hasDisc ? ['Discount'] : []), ...(hasTax ? ['Tax'] : []), `Amount (${cur})`];
  const body = doc.items.map((it, i) => {
    const r = totals.lines[i];
    const qty = `${Number(it.quantity.toFixed(3))}${it.unit === 'fixed' ? '' : ` ${unitText(it.unit, it.customUnit)}`}`;
    const disc = it.discountValue > 0 ? (it.discountType === 'percent' ? `${it.discountValue}%` : formatNumber(r.lineDiscountMinor, cur)) : '-';
    const tax = r.treatment === 'taxable' ? `${r.taxRate}%` : TREATMENT_LABEL[r.treatment];
    return [
      String(i + 1), safe(c, it.description || '-'), ...(hasCode ? [safe(c, it.serviceCode)] : []), safe(c, qty),
      formatNumber(toMinor(it.rate, cur), cur), ...(hasDisc ? [disc] : []), ...(hasTax ? [tax] : []), formatNumber(r.netMinor, cur),
    ];
  });

  const numericFrom = 2 + (hasCode ? 1 : 0);
  const columnStyles: Record<number, Record<string, unknown>> = {
    0: { cellWidth: 8, halign: 'center' },
    1: { cellWidth: 'auto' },
  };
  if (hasCode) columnStyles[2] = { cellWidth: 18 };
  for (let col = numericFrom; col < head.length; col++) columnStyles[col] = { halign: 'right', cellWidth: col === head.length - 1 ? 28 : 'wrap' };

  const base = {
    head: [head],
    body,
    startY: c.y,
    margin: { left: M, right: M, top: 20, bottom: 22 },
    showHead: 'everyPage' as const,
    rowPageBreak: 'avoid' as const,
    styles: { font: theme.font, fontSize: 8.5, cellPadding: 2.2, textColor: TEXT, overflow: 'linebreak' as const, valign: 'top' as const },
    columnStyles,
  };

  let opts: Record<string, unknown>;
  switch (theme.id) {
    case 'minimal':
      opts = {
        theme: 'plain',
        headStyles: { fontStyle: 'bold', textColor: [30, 30, 30], lineWidth: { bottom: 0.4 }, lineColor: [60, 60, 60] },
        bodyStyles: { lineWidth: { bottom: 0.15 }, lineColor: RULE },
      };
      break;
    case 'modern':
      opts = {
        theme: 'striped',
        headStyles: { fillColor: theme.secondary, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: tint(theme.secondary, 0.94) },
      };
      break;
    case 'executive':
      opts = {
        theme: 'grid',
        headStyles: { fillColor: theme.primary, textColor: 255, fontStyle: 'bold', lineColor: theme.primary },
        bodyStyles: { lineColor: RULE, lineWidth: 0.15 },
      };
      break;
    default:
      opts = {
        theme: 'striped',
        headStyles: { fillColor: theme.primary, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: tint(theme.primary, 0.95) },
      };
  }
  // Header cells for numeric columns right-aligned too.
  autoTable(pdf, {
    ...base,
    ...opts,
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= numericFrom) data.cell.styles.halign = 'right';
      if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'center';
    },
  } as Parameters<typeof autoTable>[1]);
  c.y = ((pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? c.y) + 6;
}

// ---- totals + payment info ------------------------------------------------------------------

function totalRows(c: Ctx, doc: DocumentRecord, t: Totals, showPaid: boolean): { label: string; value: string; strong?: boolean; grand?: boolean }[] {
  const cur = doc.currency;
  const f = (m: number) => formatNumber(m, cur);
  const rows: { label: string; value: string; strong?: boolean; grand?: boolean }[] = [{ label: 'Subtotal', value: f(t.subtotalMinor) }];
  if (t.lineDiscountMinor) rows.push({ label: 'Line discounts', value: `-${f(t.lineDiscountMinor)}` });
  if (t.invoiceDiscountMinor) {
    const pct = doc.invoiceDiscountType === 'percent' ? ` (${doc.invoiceDiscountValue}%)` : '';
    rows.push({ label: `Discount${pct}`, value: `-${f(t.invoiceDiscountMinor)}` });
  }
  if (doc.taxMode !== 'none') rows.push({ label: 'Taxable value', value: f(t.taxableMinor - t.nonTaxableMinor) });
  if (t.nonTaxableMinor) rows.push({ label: 'Zero-rated / exempt / non-GST', value: f(t.nonTaxableMinor) });
  for (const ch of t.charges) rows.push({ label: ch.label || 'Additional charge', value: f(ch.amountMinor) });
  for (const tr of t.taxRows) rows.push({ label: `${tr.label} @ ${tr.rate}%`, value: f(tr.taxMinor) });
  if (t.roundOffMinor) rows.push({ label: 'Round off', value: `${t.roundOffMinor > 0 ? '+' : ''}${f(t.roundOffMinor)}` });
  rows.push({ label: `Total (${cur})`, value: money(c, t.grandTotalMinor, cur), grand: true });
  if (showPaid && t.paidMinor > 0) {
    rows.push({ label: 'Amount paid', value: f(t.paidMinor) });
    rows.push({ label: 'Balance due', value: money(c, t.balanceMinor, cur), strong: true });
  }
  return rows;
}

function bankLines(co: CompanyProfile): string[] {
  const b = co.bank;
  return [
    b.accountHolder && `Account name: ${b.accountHolder}`,
    b.bankName && `Bank: ${b.bankName}${b.branch ? `, ${b.branch}` : ''}`,
    b.accountNumber && `Account no: ${b.accountNumber}`,
    b.ifsc && `IFSC: ${b.ifsc}`,
    b.swift && `SWIFT/BIC: ${b.swift}`,
    co.upiId && `UPI: ${co.upiId}`,
  ].filter(Boolean) as string[];
}

function drawQr(c: Ctx, text: string, x: number, y: number, size: number) {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const cell = size / n;
    c.pdf.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.modules.get(r, col)) c.pdf.rect(x + col * cell, y + r * cell, cell + 0.02, cell + 0.02, 'F');
    return true;
  } catch {
    c.warnings.push('UPI QR code could not be generated.');
    return false;
  }
}

function drawTotals(c: Ctx, doc: DocumentRecord, t: Totals) {
  const { pdf, theme } = c;
  const co = doc.companySnapshot;
  const showPayInfo = doc.type === 'invoice' || doc.type === 'proforma' || doc.type === 'debit-note';
  const rows = totalRows(c, doc, t, doc.type === 'invoice' || doc.type === 'proforma');
  const rowH = 5.3;
  const boxW = 82;
  const bx = PAGE_W - M - boxW;
  const rightH = rows.length * rowH + 6;

  const leftW = PAGE_W - 2 * M - boxW - 8;
  const words = amountInWords(doc.type === 'invoice' && t.paidMinor > 0 ? t.grandTotalMinor : t.grandTotalMinor, doc.currency, currencyDigits(doc.currency));
  font(c, 'italic', 8);
  const wordLines: string[] = pdf.splitTextToSize(safe(c, words), leftW);
  const upi = !!(showPayInfo && co.upiId && co.showUpiQr && doc.currency === 'INR' && t.balanceMinor > 0);
  const QR = 22;
  // QR sits to the right of the bank details, so bank text wraps in the remaining width.
  const bankW = upi ? leftW - QR - 4 : leftW;
  font(c, 'normal', 8.5);
  const banks: string[] = (showPayInfo ? bankLines(co) : []).flatMap((b) => pdf.splitTextToSize(safe(c, b), bankW) as string[]);
  let leftH = 6 + wordLines.length * 3.8;
  if (banks.length || upi) leftH += 8 + Math.max(banks.length * 4, upi ? QR + 7 : 0);
  const discountNote = t.lineDiscountMinor || t.invoiceDiscountMinor;

  ensure(c, Math.max(leftH, rightH) + (discountNote ? 5 : 0)); // keep totals and payment instructions together
  const y0 = c.y;

  // Right: totals
  let y = y0;
  rows.forEach((r) => {
    if (r.grand) {
      const fill = theme.id === 'minimal' ? ([245, 245, 245] as RGB) : theme.id === 'modern' ? theme.secondary : theme.primary;
      pdf.setFillColor(...fill);
      pdf.rect(bx, y - 0.5, boxW, rowH + 2, 'F');
      const col: RGB = theme.id === 'minimal' ? [20, 20, 20] : [255, 255, 255];
      font(c, 'bold', 10, col);
      pdf.text(safe(c, r.label), bx + 2.5, y + 4.2);
      pdf.text(safe(c, r.value), PAGE_W - M - 2.5, y + 4.2, { align: 'right' });
      if (theme.id === 'minimal') {
        pdf.setDrawColor(40, 40, 40);
        pdf.setLineWidth(0.4);
        pdf.line(bx, y - 0.5, PAGE_W - M, y - 0.5);
      }
      y += rowH + 2.5;
    } else {
      font(c, r.strong ? 'bold' : 'normal', r.strong ? 9.5 : 8.5, r.strong ? TEXT : MUTED);
      pdf.text(safe(c, r.label), bx + 2.5, y + 3.8);
      font(c, r.strong ? 'bold' : 'normal', r.strong ? 9.5 : 8.5, TEXT);
      pdf.text(safe(c, r.value), PAGE_W - M - 2.5, y + 3.8, { align: 'right' });
      y += rowH;
    }
  });
  if (theme.id === 'executive') {
    pdf.setDrawColor(...theme.primary);
    pdf.setLineWidth(0.3);
    pdf.rect(bx, y0 - 1.5, boxW, y - y0 + 2);
  }
  if (discountNote) {
    font(c, 'italic', 7, MUTED);
    pdf.text('Discounts are applied before tax.', PAGE_W - M, y + 3, { align: 'right' });
    y += 5;
  }

  // Left: amount in words + payment details
  let ly = y0;
  sectionLabel(c, 'Amount in words', M, ly + 3);
  ly += 5.5;
  font(c, 'italic', 8, TEXT);
  for (const w of wordLines) {
    pdf.text(w, M, ly + 3);
    ly += 3.8;
  }
  if (banks.length || upi) {
    ly += 3;
    sectionLabel(c, 'Payment details', M, ly + 3);
    ly += 5.5;
    const blockTop = ly;
    font(c, 'normal', 8.5, TEXT);
    for (const b of banks) {
      pdf.text(b, M, ly + 3);
      ly += 4;
    }
    if (upi) {
      const qx = M + leftW - QR;
      const amount = (t.balanceMinor / 10 ** currencyDigits('INR')).toFixed(2);
      const uri = `upi://pay?pa=${encodeURIComponent(co.upiId)}&pn=${encodeURIComponent(co.legalName.slice(0, 40))}&am=${amount}&cu=INR&tn=${encodeURIComponent(doc.number)}`;
      if (drawQr(c, uri, qx, blockTop, QR)) {
        font(c, 'normal', 6.5, MUTED);
        pdf.text('Scan to pay via UPI', qx + QR / 2, blockTop + QR + 3, { align: 'center' });
      }
      ly = Math.max(ly, blockTop + QR + 5);
    }
  }
  c.y = Math.max(y, ly) + 4;
}

// ---- notes / terms / signature ----------------------------------------------------------------

function drawTextSections(c: Ctx, doc: DocumentRecord, width: number) {
  const sections: [string, string][] = [
    ['Notes', doc.notes],
    [doc.type === 'quotation' ? 'Scope & terms' : 'Terms & conditions', doc.terms],
    ['Declaration', doc.type === 'invoice' ? doc.companySnapshot.declaration : ''],
  ];
  if (doc.reverseCharge && (doc.taxMode === 'intra' || doc.taxMode === 'inter')) {
    sections.unshift(['Reverse charge', 'Tax on this supply is payable by the recipient under reverse charge.']);
  }
  for (const [label, text] of sections) {
    if (!text?.trim()) continue;
    ensure(c, 12);
    sectionLabel(c, label, M, c.y + 3);
    c.y += 5;
    para(c, text, M, width, 8.5, TEXT);
    c.y += 3;
  }
}

const SIG_W = 70;

/** Signature block in the right column starting at y0 on the current page. Returns its bottom y. */
function signatureBlock(c: Ctx, co: CompanyProfile, y0: number): number {
  const { pdf } = c;
  const x = PAGE_W - M - SIG_W;
  font(c, 'normal', 8.5, MUTED);
  pdf.text(safe(c, `For ${co.legalName || 'the company'}`), PAGE_W - M, y0 + 3, { align: 'right' });
  let imgBottom = y0 + 6;
  if (co.stamp) {
    const s = fit(co.stamp, 22, 22);
    drawImage(c, co.stamp, x, y0 + 5, s.w, s.h, 'stamp');
    imgBottom = Math.max(imgBottom, y0 + 5 + s.h);
  }
  if (co.signature) {
    const s = fit(co.signature, 40, 15);
    drawImage(c, co.signature, PAGE_W - M - s.w, y0 + 6, s.w, s.h, 'signature');
    imgBottom = Math.max(imgBottom, y0 + 6 + s.h);
  }
  const lineY = Math.max(imgBottom + 2, y0 + 18);
  pdf.setDrawColor(...MUTED);
  pdf.setLineWidth(0.2);
  pdf.line(x + 10, lineY, PAGE_W - M, lineY);
  font(c, 'bold', 8.5, TEXT);
  pdf.text(safe(c, co.signatoryName || 'Authorised Signatory'), PAGE_W - M, lineY + 4, { align: 'right' });
  font(c, 'normal', 8, MUTED);
  pdf.text(safe(c, co.signatoryName ? co.signatoryDesignation || 'Authorised Signatory' : ''), PAGE_W - M, lineY + 8, { align: 'right' });
  return lineY + 11;
}

/** Notes/terms in the left column, signature alongside on the right (keeps short documents on one page). */
function drawClosing(c: Ctx, doc: DocumentRecord) {
  const { pdf } = c;
  if (!c.branding.showSignature) {
    drawTextSections(c, doc, PAGE_W - 2 * M);
  } else {
    ensure(c, 30);
    const page = pdf.getCurrentPageInfo().pageNumber;
    const sigBottom = signatureBlock(c, doc.companySnapshot, c.y);
    drawTextSections(c, doc, PAGE_W - 2 * M - SIG_W - 10);
    if (pdf.getCurrentPageInfo().pageNumber === page) c.y = Math.max(c.y, sigBottom);
  }
  if (doc.type === 'purchase-order') {
    ensure(c, 20);
    const lineY = c.y + 12;
    pdf.setDrawColor(...MUTED);
    pdf.setLineWidth(0.2);
    pdf.line(M, lineY, M + 60, lineY);
    font(c, 'bold', 8.5, TEXT);
    pdf.text('Accepted by supplier', M, lineY + 4);
    font(c, 'normal', 8, MUTED);
    pdf.text('Signature, name & date', M, lineY + 8);
    c.y = lineY + 11;
  }
}

// ---- page decorations + footer (applied to all pages after layout) ------------------------------

function finalise(c: Ctx, footerText: string, docLabel: string, draft = false) {
  const { pdf, theme } = c;
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    if (draft) {
      const GState = (pdf as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
      pdf.saveGraphicsState();
      pdf.setGState(new GState({ opacity: 0.07 }) as never);
      font(c, 'bold', 110, [0, 0, 0]);
      pdf.text('DRAFT', 48, 215, { angle: 40 });
      pdf.restoreGraphicsState();
    }
    if (theme.id === 'corporate') {
      pdf.setFillColor(...theme.primary);
      pdf.rect(0, 0, PAGE_W, 4, 'F');
    } else if (theme.id === 'modern') {
      pdf.setFillColor(...theme.secondary);
      pdf.rect(0, 0, 5, PAGE_H, 'F');
      pdf.setFillColor(...theme.primary);
      pdf.rect(0, 0, 5, 40, 'F');
    } else if (theme.id === 'executive' && i > 1) {
      pdf.setFillColor(...theme.primary);
      pdf.rect(0, 0, PAGE_W, 6, 'F');
    }
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.2);
    pdf.line(M, PAGE_H - 14, PAGE_W - M, PAGE_H - 14);
    font(c, 'normal', 7.5, MUTED);
    if (footerText.trim()) {
      const ft: string = pdf.splitTextToSize(safe(c, footerText), PAGE_W - 2 * M - 40)[0] ?? '';
      pdf.text(ft, M, PAGE_H - 9.5);
    } else {
      pdf.text(safe(c, docLabel), M, PAGE_H - 9.5);
    }
    pdf.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 9.5, { align: 'right' });
  }
}

function newPdf(doc: { number: string }, title: string, co: CompanyProfile) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.setProperties({ title: `${title} ${doc.number}`, subject: title, author: co.legalName || 'Software Invoice Studio', creator: 'Software Invoice Studio' });
  return pdf;
}

// ---- public API -------------------------------------------------------------------------------------

export interface PdfResult {
  pdf: jsPDF;
  filename: string;
  warnings: string[];
}

export function documentMeta(doc: DocumentRecord): [string, string][] {
  const meta = DOC_META[doc.type];
  const out: [string, string][] = [[`${meta.label} No.`, doc.number || '-'], ['Date', formatDate(doc.issueDate)]];
  if (meta.dueLabel && doc.dueDate) out.push([meta.dueLabel, formatDate(doc.dueDate)]);
  if (doc.type === 'invoice' || doc.type === 'proforma') out.push(['Payment terms', termsLabel(doc.paymentTerms, doc.customTermsDays)]);
  if (doc.poReference) out.push([doc.type === 'purchase-order' ? 'Reference' : 'PO reference', doc.poReference]);
  if (doc.projectName) out.push(['Project', doc.projectName]);
  if (doc.projectCode) out.push(['Project code', doc.projectCode]);
  if ((doc.taxMode === 'intra' || doc.taxMode === 'inter') && doc.placeOfSupply) out.push(['Place of supply', stateLabel(doc.placeOfSupply)]);
  if ((doc.taxMode === 'intra' || doc.taxMode === 'inter') && doc.type !== 'quotation' && doc.type !== 'purchase-order')
    out.push(['Reverse charge', doc.reverseCharge ? 'Yes' : 'No']);
  if (doc.servicePeriodFrom || doc.servicePeriodTo)
    out.push(['Service period', `${formatDate(doc.servicePeriodFrom) || '...'} - ${formatDate(doc.servicePeriodTo) || '...'}`]);
  for (const f of doc.customFields ?? []) {
    if (f.showOnPdf && f.label.trim() && f.value.trim()) out.push([f.label.trim(), f.value.trim()]);
  }
  return out;
}

export function buildDocumentPdf(doc: DocumentRecord, payments: Payment[], branding: Branding, template?: TemplateId): PdfResult {
  const title = documentTitle(doc);
  const co = doc.companySnapshot;
  const pdf = newPdf(doc, title, co);
  const c = makeCtx(pdf, template ?? doc.template, branding);
  const totals = calculateTotals({ ...doc, paymentsTotal: sumPayments(paymentsFor(doc.id, payments)) });

  drawHeader(c, co, title, documentMeta(doc));
  drawParties(c, doc);
  drawItems(c, doc, totals);
  drawTotals(c, doc, totals);
  drawClosing(c, doc);
  finalise(c, doc.footer, `${title} ${doc.number}`, doc.status === 'draft');

  return { pdf, filename: pdfFileName(DOC_META[doc.type].pdfShortTitle, doc.number, doc.client.name), warnings: c.warnings };
}

export function buildReceiptPdf(payment: Payment, invoice: DocumentRecord, allPayments: Payment[], branding: Branding): PdfResult {
  const title = 'PAYMENT RECEIPT';
  const co = invoice.companySnapshot;
  const pdf = newPdf({ number: payment.receiptNumber }, title, co);
  const c = makeCtx(pdf, invoice.template, branding);
  const cur = payment.currency;

  // Payments up to and including this one determine the balance shown on this receipt.
  const ordered = paymentsFor(invoice.id, allPayments);
  const idx = ordered.findIndex((p) => p.id === payment.id);
  const upTo = idx >= 0 ? ordered.slice(0, idx + 1) : [...ordered, payment];
  const totals = calculateTotals({ ...invoice, paymentsTotal: sumPayments(upTo) });

  const method = payment.method === 'custom' ? payment.customMethod || 'Other' : PAYMENT_METHOD_LABEL[payment.method];
  const meta: [string, string][] = [
    ['Receipt No.', payment.receiptNumber],
    ['Payment date', formatDate(payment.date)],
    ['Payment method', method],
  ];
  if (payment.reference) meta.push(['Transaction ref.', payment.reference]);
  meta.push(['Against invoice', invoice.number]);
  drawHeader(c, co, title, meta);

  const colW = (PAGE_W - 2 * M - 8) / 2;
  const y = c.y;
  const h = partyBlock(c, 'Received From', clientLines(invoice), M, colW, y);

  // Amount box
  const amountMinor = toMinor(payment.amount, cur);
  const bx = M + colW + 8;
  const fill = c.theme.id === 'minimal' ? ([242, 242, 242] as RGB) : tint(c.theme.id === 'modern' ? c.theme.secondary : c.theme.primary, 0.9);
  pdf.setFillColor(...fill);
  pdf.roundedRect(bx, y, colW, 30, 2, 2, 'F');
  sectionLabel(c, 'Amount received', bx + 4, y + 6);
  font(c, 'bold', 16, c.theme.id === 'minimal' ? TEXT : c.theme.id === 'modern' ? c.theme.secondary : c.theme.primary);
  pdf.text(money(c, amountMinor, cur), bx + 4, y + 15);
  font(c, 'italic', 7.5, MUTED);
  pdf.text(pdf.splitTextToSize(safe(c, amountInWords(amountMinor, cur, currencyDigits(cur))), colW - 8).slice(0, 3), bx + 4, y + 20);
  c.y = y + Math.max(h, 32) + 6;

  autoTable(pdf, {
    startY: c.y,
    margin: { left: M, right: M },
    theme: c.theme.id === 'minimal' ? 'plain' : 'grid',
    styles: { font: c.theme.font, fontSize: 8.5, cellPadding: 2.4, textColor: TEXT, lineColor: RULE, lineWidth: 0.15 },
    headStyles:
      c.theme.id === 'minimal'
        ? { fontStyle: 'bold', textColor: [30, 30, 30] }
        : { fillColor: c.theme.id === 'modern' ? c.theme.secondary : c.theme.primary, textColor: 255, fontStyle: 'bold' },
    head: [['Invoice No.', 'Invoice date', `Invoice total (${cur})`, `Paid to date (${cur})`, `Balance due (${cur})`]],
    body: [[safe(c, invoice.number), formatDate(invoice.issueDate), formatNumber(totals.grandTotalMinor, cur), formatNumber(totals.paidMinor, cur), formatNumber(Math.max(0, totals.balanceMinor), cur)]],
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  c.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (payment.notes.trim()) {
    sectionLabel(c, 'Notes', M, c.y + 3);
    c.y += 5;
    para(c, payment.notes, M, PAGE_W - 2 * M);
    c.y += 4;
  }
  para(c, 'This receipt records a payment entered by the issuer. It is not a bank confirmation.', M, PAGE_W - 2 * M, 7.5, MUTED, 'italic');
  c.y += 4;
  if (branding.showSignature) {
    ensure(c, 30);
    c.y = signatureBlock(c, co, c.y);
  }
  finalise(c, invoice.footer, `${title} ${payment.receiptNumber}`);
  return { pdf, filename: pdfFileName('Receipt', payment.receiptNumber, invoice.client.name), warnings: c.warnings };
}

// ---- browser actions -------------------------------------------------------------------------------

export function downloadPdf(r: PdfResult) {
  r.pdf.save(r.filename);
}

export function pdfBlobUrl(r: PdfResult): string {
  return URL.createObjectURL(r.pdf.output('blob'));
}

/** Print the generated PDF via a hidden iframe; falls back to opening it in a new tab. */
export function printPdf(r: PdfResult) {
  const url = pdfBlobUrl(r);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(iframe);
}
