// Shared, deterministic document calculation engine.
// Every UI screen, PDF and dashboard metric uses calculateTotals() — never duplicate this logic.
//
// Order of operations (discounts are applied BEFORE tax):
//   gross = qty × rate
//   line discount (percent or fixed, capped at gross)
//   invoice-level discount allocated pro-rata across lines (capped, never negative)
//   tax per line on the taxable value, per the line's tax rate and treatment
//   additional charges (each with its own tax rate)
//   optional round-off to whole currency units
//   balance = grand total − advance − recorded payments

import type { Charge, DiscountType, LineItem, TaxMode, TaxTreatment } from '../../types';
import { currencyDigits, roundHalf, toMinor } from '../../utils/money';

export interface LineResult {
  id: string;
  grossMinor: number;
  lineDiscountMinor: number;
  netMinor: number; // after line discount — shown as the line "Amount"
  invoiceDiscountShareMinor: number;
  taxableMinor: number;
  taxRate: number;
  treatment: TaxTreatment;
  taxMinor: number;
}

export interface TaxRow {
  label: string; // CGST / SGST / IGST / VAT ...
  rate: number; // percent applied for this component
  taxableMinor: number;
  taxMinor: number;
}

export interface ChargeResult {
  id: string;
  label: string;
  amountMinor: number;
  taxMinor: number;
}

export interface Totals {
  currency: string;
  lines: LineResult[];
  charges: ChargeResult[];
  subtotalMinor: number; // Σ gross
  lineDiscountMinor: number;
  invoiceDiscountMinor: number;
  taxableMinor: number; // items taxable value after all discounts
  nonTaxableMinor: number; // portion of taxable value under zero/exempt/non-GST treatment
  chargesMinor: number; // Σ charges before tax
  taxRows: TaxRow[];
  taxMinor: number;
  roundOffMinor: number;
  grandTotalMinor: number;
  paidMinor: number;
  balanceMinor: number;
}

export interface CalcInput {
  currency: string;
  items: LineItem[];
  taxMode: TaxMode;
  taxLabel?: string;
  invoiceDiscountType: DiscountType;
  invoiceDiscountValue: number;
  charges: Charge[];
  advancePaid: number;
  roundOff: boolean;
  /** Additional recorded payments (major units). */
  paymentsTotal?: number;
  /** 'paid' marks the document as fully settled: no balance remains due. */
  paymentTerms?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

export function discountMinor(baseMinor: number, type: DiscountType, value: number, currency: string): number {
  const v = Math.max(0, safe(value));
  const raw = type === 'percent' ? roundHalf((baseMinor * Math.min(v, 100)) / 100) : toMinor(v, currency);
  return clamp(raw, 0, Math.max(0, baseMinor));
}

/** Distribute `total` across `weights` proportionally using the largest-remainder method (exact sum). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export const isTaxable = (t: TaxTreatment) => t === 'taxable';

function taxComponents(mode: TaxMode, rate: number, taxableMinor: number, taxLabel: string): TaxRow[] {
  if (mode === 'none' || rate <= 0 || taxableMinor === 0) return [];
  if (mode === 'intra') {
    const half = rate / 2;
    const t = roundHalf((taxableMinor * half) / 100);
    return [
      { label: 'CGST', rate: half, taxableMinor, taxMinor: t },
      { label: 'SGST', rate: half, taxableMinor, taxMinor: t },
    ];
  }
  const label = mode === 'inter' ? 'IGST' : taxLabel.trim() || 'Tax';
  return [{ label, rate, taxableMinor, taxMinor: roundHalf((taxableMinor * rate) / 100) }];
}

function addRows(map: Map<string, TaxRow>, rows: TaxRow[]) {
  for (const r of rows) {
    const key = `${r.label}@${r.rate}`;
    const cur = map.get(key);
    if (cur) {
      cur.taxableMinor += r.taxableMinor;
      cur.taxMinor += r.taxMinor;
    } else map.set(key, { ...r });
  }
}

export function calculateTotals(input: CalcInput): Totals {
  const { currency, taxMode } = input;
  const taxLabel = input.taxLabel ?? 'Tax';

  const base = input.items.map((it) => {
    const qty = Math.max(0, safe(it.quantity));
    const rateMinor = Math.max(0, toMinor(safe(it.rate), currency));
    const grossMinor = roundHalf(qty * rateMinor);
    const lineDiscount = discountMinor(grossMinor, it.discountType, it.discountValue, currency);
    return { it, grossMinor, lineDiscount, netMinor: grossMinor - lineDiscount };
  });

  const netSum = base.reduce((a, b) => a + b.netMinor, 0);
  const invoiceDiscount = discountMinor(netSum, input.invoiceDiscountType, input.invoiceDiscountValue, currency);
  const shares = allocate(invoiceDiscount, base.map((b) => b.netMinor));

  const taxMap = new Map<string, TaxRow>();
  let nonTaxable = 0;
  const lines: LineResult[] = base.map((b, i) => {
    const taxableMinor = b.netMinor - shares[i];
    const rate = Math.max(0, safe(b.it.taxRate));
    const treatment = b.it.taxTreatment ?? 'taxable';
    let taxMinor = 0;
    if (isTaxable(treatment) && taxMode !== 'none') {
      const comps = taxComponents(taxMode, rate, taxableMinor, taxLabel);
      addRows(taxMap, comps);
      taxMinor = comps.reduce((a, c) => a + c.taxMinor, 0);
    } else {
      nonTaxable += taxableMinor;
    }
    return {
      id: b.it.id,
      grossMinor: b.grossMinor,
      lineDiscountMinor: b.lineDiscount,
      netMinor: b.netMinor,
      invoiceDiscountShareMinor: shares[i],
      taxableMinor,
      taxRate: rate,
      treatment,
      taxMinor,
    };
  });

  const charges: ChargeResult[] = input.charges.map((c) => {
    const amountMinor = Math.max(0, toMinor(safe(c.amount), currency));
    const comps = taxMode === 'none' ? [] : taxComponents(taxMode, Math.max(0, safe(c.taxRate)), amountMinor, taxLabel);
    addRows(taxMap, comps);
    return { id: c.id, label: c.label, amountMinor, taxMinor: comps.reduce((a, x) => a + x.taxMinor, 0) };
  });

  const subtotalMinor = base.reduce((a, b) => a + b.grossMinor, 0);
  const lineDiscountMinor = base.reduce((a, b) => a + b.lineDiscount, 0);
  const taxableMinor = netSum - invoiceDiscount;
  const chargesMinor = charges.reduce((a, c) => a + c.amountMinor, 0);
  const taxRows = [...taxMap.values()].sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label));
  const taxMinor = lines.reduce((a, l) => a + l.taxMinor, 0) + charges.reduce((a, c) => a + c.taxMinor, 0);

  const beforeRound = taxableMinor + chargesMinor + taxMinor;
  let roundOffMinor = 0;
  if (input.roundOff) {
    const unit = 10 ** currencyDigits(currency);
    roundOffMinor = roundHalf(beforeRound / unit) * unit - beforeRound;
  }
  const grandTotalMinor = beforeRound + roundOffMinor;
  const recordedPaidMinor =
    Math.max(0, toMinor(safe(input.advancePaid), currency)) + Math.max(0, toMinor(safe(input.paymentsTotal ?? 0), currency));
  // Payment terms "Paid": the full amount is treated as received, so nothing is due.
  const paidMinor = input.paymentTerms === 'paid' ? Math.max(recordedPaidMinor, grandTotalMinor) : recordedPaidMinor;

  return {
    currency,
    lines,
    charges,
    subtotalMinor,
    lineDiscountMinor,
    invoiceDiscountMinor: invoiceDiscount,
    taxableMinor,
    nonTaxableMinor: nonTaxable,
    chargesMinor,
    taxRows,
    taxMinor,
    roundOffMinor,
    grandTotalMinor,
    paidMinor,
    balanceMinor: grandTotalMinor - paidMinor,
  };
}
