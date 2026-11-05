// @vitest-environment jsdom
// Boots the real app (router, storage, every page) against an in-memory IndexedDB and
// visits each route, failing on any render crash.
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { db, saveCompany } from '../services/storage/db';
import { createDraft, saveDocument, recordPayment } from '../features/documents/actions';
import { emptyCompany, emptyLine } from '../services/domain';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
URL.createObjectURL = () => 'blob:mock';
URL.revokeObjectURL = () => undefined;
window.scrollTo = () => undefined;
// jsdom's AbortSignal is not accepted by Node's fetch Request (used by React Router navigation).
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init ? { ...init, signal: undefined } : init);
  }
} as typeof Request;

let root: Root;
let container: HTMLDivElement;
const errors: unknown[] = [];

const settle = async (ms = 60) => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};
async function visit(hash: string) {
  await act(async () => { window.location.hash = hash; });
  await settle();
  return container.textContent ?? '';
}

beforeAll(async () => {
  window.addEventListener('error', (e) => errors.push(e.error));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
  await settle();
});

afterAll(() => act(() => root.unmount()));

describe('app smoke test', { timeout: 30_000 }, () => {
  it('opens the dashboard with an empty state and seeded catalogue', async () => {
    const text = await visit('#/');
    expect(text).toContain('Dashboard');
    expect(text).toContain('No documents yet');
    expect(await db.services.count()).toBeGreaterThan(20);
  });

  it('renders every main route', async () => {
    const routes: [string, string][] = [
      ['#/d/invoice/new', 'New Invoice'],
      ['#/d/quotation', 'Quotations'],
      ['#/d/quotation/new', 'New Quotation'],
      ['#/d/proforma/new', 'New Proforma Invoice'],
      ['#/d/credit-note/new', 'Original invoice'],
      ['#/d/debit-note/new', 'New Debit Note'],
      ['#/d/purchase-order/new', 'Deliver to'],
      ['#/receipts', 'Payment Receipts'],
      ['#/clients', 'Clients'],
      ['#/services', 'Services Catalogue'],
      ['#/history', 'Invoice History'],
      ['#/recurring', 'Recurring Invoices'],
      ['#/settings', 'Business identity'],
      ['#/settings?tab=branding', 'Corporate Blue'],
      ['#/settings?tab=numbering', 'Document numbering'],
      ['#/settings?tab=fields', 'Add custom field'],
      ['#/settings?tab=branding', 'App appearance'],
      ['#/reports', 'Nothing to report'],
      ['#/settings?tab=backup', 'Export backup'],
      ['#/d/not-a-type', 'Page not found'],
    ];
    for (const [hash, expected] of routes) {
      const text = await visit(hash);
      expect(text, `route ${hash}`).toContain(expected);
    }
  });

  it('shows saved documents, payments and editing for an invoice', async () => {
    await saveCompany({ ...emptyCompany(), legalName: 'Smoke Test Ltd' });
    const d = await createDraft('invoice');
    d.client.name = 'Client A';
    d.items = [emptyLine(18, { description: 'Consulting', quantity: 10, rate: 1000 })];
    d.status = 'unpaid';
    const saved = await saveDocument(d);
    await recordPayment({ documentId: saved.id, receiptNumber: 'RCPT-1', date: '2026-01-01', amount: 500, currency: 'INR', method: 'upi', customMethod: '', reference: '', notes: '' }, saved);

    let text = await visit(`#/d/invoice/${saved.id}`);
    expect(text).toContain(saved.number);
    expect(text).toContain('Partially Paid');
    expect(text).toContain('RCPT-1');

    text = await visit(`#/d/invoice/${saved.id}/edit`);
    expect(text).toContain(`Edit Invoice ${saved.number}`);
    expect(text).toContain('editing a finalised document');

    text = await visit('#/history');
    expect(text).toContain('Client A');
    text = await visit('#/receipts');
    expect(text).toContain('RCPT-1');
    text = await visit('#/reports');
    expect(text).toContain('Monthly summary');
    expect(text).toContain('Client A');
    text = await visit('#/');
    expect(text).toContain('Recent documents');
    expect(text).not.toContain('No documents yet');
  });

  it('raised no uncaught errors', () => {
    expect(errors).toEqual([]);
  });
});
