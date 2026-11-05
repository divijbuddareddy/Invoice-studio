import { describe, expect, it } from 'vitest';
import { allocate, calculateTotals, type CalcInput } from './calc';
import { emptyLine } from '../domain';
import type { LineItem } from '../../types';

const line = (p: Partial<LineItem>) => emptyLine(18, p);
const base = (p: Partial<CalcInput>): CalcInput => ({
  currency: 'INR', items: [], taxMode: 'intra', invoiceDiscountType: 'percent', invoiceDiscountValue: 0, charges: [],
  advancePaid: 0, roundOff: false, ...p,
});

describe('calculateTotals', () => {
  it('computes quantity × rate with fractional hours', () => {
    const t = calculateTotals(base({ items: [line({ quantity: 7.5, rate: 1500, taxRate: 0 })], taxMode: 'none' }));
    expect(t.subtotalMinor).toBe(1125000);
    expect(t.grandTotalMinor).toBe(1125000);
  });

  it('applies percentage and fixed line discounts before tax', () => {
    const t = calculateTotals(
      base({
        items: [
          line({ quantity: 1, rate: 10000, discountType: 'percent', discountValue: 10 }),
          line({ quantity: 2, rate: 500, discountType: 'fixed', discountValue: 100 }),
        ],
        taxMode: 'inter',
      }),
    );
    expect(t.lineDiscountMinor).toBe(100000 + 10000);
    expect(t.taxableMinor).toBe(900000 + 90000);
    expect(t.taxRows).toEqual([{ label: 'IGST', rate: 18, taxableMinor: 990000, taxMinor: 178200 }]);
    expect(t.grandTotalMinor).toBe(990000 + 178200);
  });

  it('splits intra-state GST into CGST + SGST', () => {
    const t = calculateTotals(base({ items: [line({ quantity: 1, rate: 100000, taxRate: 18 })] }));
    expect(t.taxRows.map((r) => [r.label, r.rate, r.taxMinor])).toEqual([
      ['CGST', 9, 900000],
      ['SGST', 9, 900000],
    ]);
    expect(t.grandTotalMinor).toBe(11800000);
  });

  it('groups multiple tax rates and handles exempt / zero-rated lines', () => {
    const t = calculateTotals(
      base({
        taxMode: 'inter',
        items: [
          line({ rate: 1000, taxRate: 18 }),
          line({ rate: 1000, taxRate: 5 }),
          line({ rate: 1000, taxRate: 18, taxTreatment: 'exempt' }),
          line({ rate: 1000, taxRate: 0, taxTreatment: 'zero-rated' }),
        ],
      }),
    );
    expect(t.taxRows.map((r) => `${r.label}${r.rate}:${r.taxMinor}`)).toEqual(['IGST5:5000', 'IGST18:18000']);
    expect(t.nonTaxableMinor).toBe(200000);
    expect(t.grandTotalMinor).toBe(400000 + 23000);
  });

  it('allocates invoice-level discount across lines before tax', () => {
    const t = calculateTotals(
      base({
        taxMode: 'inter',
        items: [line({ rate: 1000, taxRate: 18 }), line({ rate: 1000, taxRate: 5 })],
        invoiceDiscountType: 'fixed',
        invoiceDiscountValue: 200,
      }),
    );
    expect(t.invoiceDiscountMinor).toBe(20000);
    expect(t.taxableMinor).toBe(180000);
    // 900 @18% = 162, 900 @5% = 45
    expect(t.taxMinor).toBe(16200 + 4500);
  });

  it('never lets discounts make taxable value negative', () => {
    const t = calculateTotals(
      base({
        items: [line({ rate: 100, discountType: 'fixed', discountValue: 500 })],
        invoiceDiscountType: 'percent',
        invoiceDiscountValue: 150,
      }),
    );
    expect(t.taxableMinor).toBe(0);
    expect(t.grandTotalMinor).toBe(0);
  });

  it('ignores negative quantities and rates', () => {
    const t = calculateTotals(base({ items: [line({ quantity: -2, rate: 100 }), line({ quantity: 1, rate: -5 })] }));
    expect(t.grandTotalMinor).toBe(0);
  });

  it('adds taxable charges, advances and computes balance', () => {
    const t = calculateTotals(
      base({
        taxMode: 'inter',
        items: [line({ rate: 1000, taxRate: 18 })],
        charges: [{ id: 'c', label: 'Travel', amount: 100, taxRate: 0 }],
        advancePaid: 500,
        paymentsTotal: 200,
      }),
    );
    expect(t.chargesMinor).toBe(10000);
    expect(t.grandTotalMinor).toBe(100000 + 18000 + 10000);
    expect(t.paidMinor).toBe(70000);
    expect(t.balanceMinor).toBe(128000 - 70000);
  });

  it('rounds to whole units only when enabled', () => {
    const items = [line({ quantity: 1, rate: 99.99, taxRate: 18 })];
    const off = calculateTotals(base({ items, taxMode: 'inter' }));
    expect(off.grandTotalMinor).toBe(9999 + 1800);
    expect(off.roundOffMinor).toBe(0);
    const on = calculateTotals(base({ items, taxMode: 'inter', roundOff: true }));
    expect(on.grandTotalMinor).toBe(11800);
    expect(on.roundOffMinor).toBe(1);
  });

  it('avoids floating point errors (0.1 + 0.2)', () => {
    const t = calculateTotals(base({ taxMode: 'none', items: [line({ rate: 0.1 }), line({ rate: 0.2 })] }));
    expect(t.grandTotalMinor).toBe(30);
  });

  it('respects currency minor units (JPY has none)', () => {
    const t = calculateTotals(base({ currency: 'JPY', taxMode: 'other', taxLabel: 'Consumption tax', items: [line({ rate: 1234.6, taxRate: 10 })] }));
    expect(t.subtotalMinor).toBe(1235);
    expect(t.taxRows[0]).toMatchObject({ label: 'Consumption tax', taxMinor: 124 });
  });

  it('applies no tax when tax mode is none', () => {
    const t = calculateTotals(base({ taxMode: 'none', items: [line({ rate: 1000, taxRate: 18 })] }));
    expect(t.taxMinor).toBe(0);
    expect(t.taxRows).toHaveLength(0);
  });
});

describe('allocate', () => {
  it('distributes exactly with largest remainder', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
    expect(allocate(7, [3, 1]).reduce((a, b) => a + b)).toBe(7);
  });
});
