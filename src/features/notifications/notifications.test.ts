import { describe, expect, it } from 'vitest';
import { buildInvoiceNotifications, daysBetween, invoiceReminderDue } from './notifications';
import { defaultSettings, emptyCompany, newDocument } from '../../services/domain';
import type { DocumentRecord } from '../../types';

function makeInvoice(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const d = newDocument('invoice', defaultSettings(), emptyCompany());
  d.status = 'unpaid';
  d.client.name = 'Acme Client';
  return { ...d, ...overrides };
}

describe('invoice billing notifications', () => {
  it('computes UTC day differences cleanly', () => {
    expect(daysBetween('2026-11-25', '2026-11-30')).toBe(5);
    expect(daysBetween('2026-11-25', '2026-12-10')).toBe(15);
  });

  it('ignores one-time, cancelled, archived, and non-invoice documents', () => {
    const oneTime = makeInvoice({ billingFrequency: 'one-time', issueDate: '2026-10-30', billingStartDate: '2026-10-30' });
    expect(invoiceReminderDue(oneTime, '2026-11-25')).toBeNull();

    const cancelled = makeInvoice({ billingFrequency: 'monthly', status: 'cancelled', issueDate: '2026-10-30', billingStartDate: '2026-10-30' });
    expect(invoiceReminderDue(cancelled, '2026-11-25')).toBeNull();

    const archived = makeInvoice({ billingFrequency: 'monthly', archived: true, issueDate: '2026-10-30', billingStartDate: '2026-10-30' });
    expect(invoiceReminderDue(archived, '2026-11-25')).toBeNull();

    const quote = { ...newDocument('quotation', defaultSettings(), emptyCompany()), billingFrequency: 'monthly' as const, issueDate: '2026-10-30' };
    expect(invoiceReminderDue(quote, '2026-11-25')).toBeNull();
  });

  it('notifies 5 days before monthly recurring billing date and respects billingEndDate', () => {
    const inv = makeInvoice({
      billingFrequency: 'monthly',
      issueDate: '2026-10-30',
      billingStartDate: '2026-10-30',
    });
    expect(invoiceReminderDue(inv, '2026-11-24')).toBeNull(); // 6 days before 2026-11-30
    expect(invoiceReminderDue(inv, '2026-11-25')).toMatchObject({ dueDate: '2026-11-30', daysUntilDue: 5 });
    expect(invoiceReminderDue(inv, '2026-11-30')).toMatchObject({ dueDate: '2026-11-30', daysUntilDue: 0 });

    const ended = makeInvoice({
      billingFrequency: 'monthly',
      issueDate: '2026-10-30',
      billingStartDate: '2026-10-30',
      billingEndDate: '2026-11-15',
    });
    expect(invoiceReminderDue(ended, '2026-11-25')).toBeNull();
  });

  it('notifies 10 days before quarterly recurring billing date', () => {
    const inv = makeInvoice({
      billingFrequency: 'quarterly',
      issueDate: '2026-09-01',
      billingStartDate: '2026-09-01',
    });
    expect(invoiceReminderDue(inv, '2026-11-20')).toBeNull(); // 11 days before 2026-12-01
    expect(invoiceReminderDue(inv, '2026-11-21')).toMatchObject({ dueDate: '2026-12-01', daysUntilDue: 10 });
  });

  it('notifies 15 days before yearly (annual) recurring billing date', () => {
    const inv = makeInvoice({
      billingFrequency: 'yearly',
      issueDate: '2025-12-10',
      billingStartDate: '2025-12-10',
    });
    expect(invoiceReminderDue(inv, '2026-11-24')).toBeNull(); // 16 days before 2026-12-10
    expect(invoiceReminderDue(inv, '2026-11-25')).toMatchObject({ dueDate: '2026-12-10', daysUntilDue: 15 });
  });

  it('notifies for a future billingStartDate when within the lead window', () => {
    const inv = makeInvoice({
      billingFrequency: 'monthly',
      issueDate: '2026-11-25',
      billingStartDate: '2026-11-28',
    });
    expect(invoiceReminderDue(inv, '2026-11-25')).toMatchObject({ dueDate: '2026-11-28', daysUntilDue: 3 });
  });

  it('tracks read vs unread notifications per cycle and sorts unread first', () => {
    const m = makeInvoice({ id: 'm1', number: 'INV-M', billingFrequency: 'monthly', issueDate: '2026-10-30', billingStartDate: '2026-10-30' });
    const y = makeInvoice({ id: 'y1', number: 'INV-Y', billingFrequency: 'yearly', issueDate: '2025-12-05', billingStartDate: '2025-12-05' });
    const list = buildInvoiceNotifications([m, y], ['m1:2026-11-30'], '2026-11-25');
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'y1:2026-12-05', read: false });
    expect(list[1]).toMatchObject({ id: 'm1:2026-11-30', read: true });
  });
});
