// Pure billing-reminder notification logic for recurring invoices.

import type { BillingFrequency, DocumentRecord } from '../../types';
import { addMonths, parseDate, todayStr } from '../../utils/misc';

export type RecurringBillingFrequency = Exclude<BillingFrequency, 'one-time'>;

export const BILLING_LEAD_DAYS: Record<RecurringBillingFrequency, number> = {
  monthly: 5,
  quarterly: 10,
  yearly: 15,
};

const BILLING_STEP_MONTHS: Record<RecurringBillingFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export interface InvoiceNotification {
  id: string;
  documentId: string;
  invoiceNumber: string;
  clientName: string;
  frequency: RecurringBillingFrequency;
  dueDate: string;
  daysUntilDue: number;
  leadDays: number;
  read: boolean;
}

function utcDayMs(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((utcDayMs(toDate) - utcDayMs(fromDate)) / 86_400_000);
}

/**
 * Compute the active reminder window for a single invoice, or null when no reminder is due.
 * One-time invoices never trigger reminders.
 */
export function invoiceReminderDue(
  doc: Pick<DocumentRecord, 'id' | 'type' | 'number' | 'status' | 'archived' | 'issueDate' | 'billingFrequency' | 'billingStartDate' | 'billingEndDate' | 'client'>,
  today = todayStr(),
): Omit<InvoiceNotification, 'read'> | null {
  if (doc.type !== 'invoice' || doc.archived || doc.status === 'cancelled') return null;
  const freq = doc.billingFrequency;
  if (!freq || freq === 'one-time') return null;

  const start = doc.billingStartDate || doc.issueDate;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const end = doc.billingEndDate || '';
  if (end && end < start) return null;

  const step = BILLING_STEP_MONTHS[freq];
  const leadDays = BILLING_LEAD_DAYS[freq];
  const anchor = parseDate(start).getDate();

  // If billing starts in the future relative to the invoice issue date, remind for the start date itself.
  // Otherwise the initial invoice covers the start date, so remind starting from the next recurring cycle.
  let cycle = doc.billingStartDate && doc.issueDate && doc.billingStartDate > doc.issueDate
    ? start
    : addMonths(start, step, anchor);

  for (let i = 0; i < 1200 && cycle < today; i++) {
    cycle = addMonths(cycle, step, anchor);
  }
  if (cycle < today) return null;
  if (end && cycle > end) return null;

  const daysUntilDue = daysBetween(today, cycle);
  if (daysUntilDue < 0 || daysUntilDue > leadDays) return null;

  return {
    id: `${doc.id}:${cycle}`,
    documentId: doc.id,
    invoiceNumber: doc.number,
    clientName: doc.client.name || 'No client',
    frequency: freq,
    dueDate: cycle,
    daysUntilDue,
    leadDays,
  };
}

/** Build sorted notifications for all recurring invoices currently within their reminder window. */
export function buildInvoiceNotifications(
  docs: DocumentRecord[],
  readIds: string[] = [],
  today = todayStr(),
): InvoiceNotification[] {
  const readSet = new Set(readIds);
  const out: InvoiceNotification[] = [];
  for (const doc of docs) {
    const due = invoiceReminderDue(doc, today);
    if (!due) continue;
    out.push({ ...due, read: readSet.has(due.id) });
  }
  return out.sort((a, b) => Number(a.read) - Number(b.read) || a.daysUntilDue - b.daysUntilDue || a.invoiceNumber.localeCompare(b.invoiceNumber));
}
