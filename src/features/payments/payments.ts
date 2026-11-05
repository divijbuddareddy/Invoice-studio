// Payment helpers (pure). Payment records are user-entered; nothing is verified with a bank.

import type { DocumentRecord, Payment } from '../../types';
import { calculateTotals, type Totals } from '../../services/calculations/calc';
import { effectiveStatus } from '../../services/domain';
import { fromMinor, toMinor } from '../../utils/money';

export function paymentsFor(docId: string, payments: Payment[]): Payment[] {
  return payments.filter((p) => p.documentId === docId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function sumPayments(list: Payment[]): number {
  // Sum in minor units to avoid floating error, then return major units.
  if (list.length === 0) return 0;
  const currency = list[0].currency;
  const minor = list.reduce((a, p) => a + toMinor(p.amount, currency), 0);
  return fromMinor(minor, currency);
}

export function docTotals(doc: DocumentRecord, payments: Payment[] = []): Totals {
  return calculateTotals({ ...doc, paymentsTotal: sumPayments(paymentsFor(doc.id, payments)) });
}

export function docSummary(doc: DocumentRecord, payments: Payment[] = []) {
  const totals = docTotals(doc, payments);
  return { totals, status: effectiveStatus(doc, totals.balanceMinor, totals.paidMinor) };
}

/** Error message for a proposed payment, or '' if acceptable. Prevents overpayment. */
export function validatePayment(amount: number, balanceMinor: number, currency: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter a payment amount greater than zero.';
  const m = toMinor(amount, currency);
  if (m > balanceMinor) return 'This payment is more than the outstanding balance. Enter the balance amount or less.';
  return '';
}
