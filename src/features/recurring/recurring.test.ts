import { describe, expect, it } from 'vitest';
import { buildRecurringDraft, dueOccurrences, nextAfter } from './recurring';
import { defaultSettings, emptyCompany, newDocument } from '../../services/domain';
import type { RecurrenceRule } from '../../types';
import { validatePayment, sumPayments } from '../payments/payments';

const rule = (p: Partial<RecurrenceRule>): RecurrenceRule => ({
  id: 'r1', sourceDocumentId: 'd1', frequency: 'monthly', startDate: '2026-01-31', endDate: '', nextDate: '2026-01-31',
  lastGeneratedPeriod: '', active: true, createdAt: '', updatedAt: '', ...p,
});

describe('recurring schedules', () => {
  it('lists due monthly periods up to today, clamping month ends', () => {
    expect(dueOccurrences(rule({}), '2026-04-15')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('respects end date and inactive rules', () => {
    expect(dueOccurrences(rule({ endDate: '2026-02-28' }), '2026-12-31')).toEqual(['2026-01-31', '2026-02-28']);
    expect(dueOccurrences(rule({ active: false }), '2026-12-31')).toEqual([]);
  });
  it('supports weekly, quarterly, half-yearly and yearly', () => {
    expect(dueOccurrences(rule({ frequency: 'weekly', startDate: '2026-01-01', nextDate: '2026-01-01' }), '2026-01-20')).toEqual([
      '2026-01-01', '2026-01-08', '2026-01-15',
    ]);
    expect(dueOccurrences(rule({ frequency: 'quarterly', startDate: '2026-01-15', nextDate: '2026-01-15' }), '2026-12-31')).toHaveLength(4);
    expect(dueOccurrences(rule({ frequency: 'half-yearly', startDate: '2026-01-15', nextDate: '2026-01-15' }), '2026-12-31')).toHaveLength(2);
    expect(nextAfter(rule({ frequency: 'yearly', startDate: '2026-03-01' }), '2026-03-01')).toBe('2027-03-01');
  });
  it('does not repeat the last generated period', () => {
    expect(dueOccurrences(rule({ lastGeneratedPeriod: '2026-01-31' }), '2026-02-01')).toEqual([]);
  });
  it('prevents duplicate drafts for the same period', () => {
    const src = { ...newDocument('invoice', defaultSettings(), emptyCompany()), id: 'd1', issueDate: '2026-01-01', dueDate: '2026-01-16', status: 'unpaid' as const };
    const r = rule({});
    const draft = buildRecurringDraft(src, r, '2026-02-28', 'INV-2026-010', []);
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe('draft');
    expect(draft!.dueDate).toBe('2026-03-15');
    expect(draft!.id).not.toBe(src.id);
    expect(buildRecurringDraft(src, r, '2026-02-28', 'X', [draft!])).toBeNull();
  });
});

describe('payments', () => {
  it('prevents overpayment and zero payments', () => {
    expect(validatePayment(100, 10000, 'INR')).toBe('');
    expect(validatePayment(100.01, 10000, 'INR')).toMatch(/more than the outstanding/);
    expect(validatePayment(0, 10000, 'INR')).toMatch(/greater than zero/);
  });
  it('sums partial payments exactly', () => {
    const p = (amount: number) => ({ id: String(amount), documentId: 'd', receiptNumber: '', date: '2026-01-01', amount, currency: 'INR', method: 'upi' as const, customMethod: '', reference: '', notes: '', createdAt: '' });
    expect(sumPayments([p(0.1), p(0.2), p(1000.15)])).toBe(1000.45);
  });
});
