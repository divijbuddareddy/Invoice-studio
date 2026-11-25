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
import { addDays, addMonths, todayStr } from '../utils/misc';

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

  it('defaults bank account by invoice type and allows manual override in invoice editor', async () => {
    await saveCompany({
      ...emptyCompany(),
      legalName: 'Smoke Test Ltd',
      bank: { accountHolder: 'Smoke Test Ltd', bankName: 'HDFC Bank', accountNumber: '11112222', ifsc: 'HDFC0001234', branch: 'BLR', swift: '' },
      personalBank: { accountHolder: 'Founder Personal', bankName: 'ICICI Bank', accountNumber: '99998888', ifsc: 'ICIC0005678', branch: 'BLR', swift: '' },
    });

    await visit('#/d/invoice/new');
    const getSelect = (labelText: string) => {
      const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === labelText);
      const id = label?.getAttribute('for');
      return id ? (document.getElementById(id) as HTMLSelectElement | null) : null;
    };
    const changeSelect = async (el: HTMLSelectElement, value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await settle(20);
    };

    const typeSelect = getSelect('Invoice type');
    const bankSelect = getSelect('Bank account');
    expect(typeSelect).not.toBeNull();
    expect(bankSelect).not.toBeNull();
    expect(typeSelect!.value).toBe('gst');
    expect(bankSelect!.value).toBe('company');
    expect(bankSelect!.options[0].textContent).toContain('Company Bank Account');
    expect(bankSelect!.options[1].textContent).toContain('Personal Bank Account');

    // Switching to Non-GST Invoice switches default bank account to Personal Bank Account.
    await changeSelect(typeSelect!, 'non-gst');
    expect(getSelect('Invoice type')!.value).toBe('non-gst');
    expect(getSelect('Bank account')!.value).toBe('personal');

    // Manual override to Company Bank Account while remaining Non-GST.
    await changeSelect(getSelect('Bank account')!, 'company');
    expect(getSelect('Bank account')!.value).toBe('company');
    expect(getSelect('Invoice type')!.value).toBe('non-gst');

    // Switching back to GST Invoice restores Company Bank Account default.
    await changeSelect(getSelect('Invoice type')!, 'gst');
    expect(getSelect('Bank account')!.value).toBe('company');

    // Manual override to Personal Bank Account while remaining GST.
    await changeSelect(getSelect('Bank account')!, 'personal');
    expect(getSelect('Bank account')!.value).toBe('personal');
    expect(getSelect('Invoice type')!.value).toBe('gst');

    // Billing frequency & date calendar inputs are present on invoice editor.
    const freqSelect = getSelect('Billing frequency');
    const startInput = (() => {
      const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Billing start date');
      const id = label?.getAttribute('for');
      return id ? (document.getElementById(id) as HTMLInputElement | null) : null;
    })();
    const endInput = (() => {
      const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Billing end date');
      const id = label?.getAttribute('for');
      return id ? (document.getElementById(id) as HTMLInputElement | null) : null;
    })();
    expect(freqSelect?.value).toBe('one-time');
    expect(startInput?.type).toBe('date');
    expect(endInput?.type).toBe('date');
    await changeSelect(freqSelect!, 'monthly');
    expect(getSelect('Billing frequency')!.value).toBe('monthly');
    expect(startInput!.value).toBe(todayStr());
  });

  it('shows recurring invoice notifications on the bell icon and decreases count when clicked', async () => {
    const today = todayStr();
    const monthlyStart = addMonths(addDays(today, 3), -1);
    const yearlyStart = addMonths(addDays(today, 10), -12);

    const mInv = await createDraft('invoice');
    mInv.number = 'INV-NOTIF-M';
    mInv.client.name = 'Monthly Corp';
    mInv.status = 'unpaid';
    mInv.issueDate = monthlyStart;
    mInv.billingFrequency = 'monthly';
    mInv.billingStartDate = monthlyStart;
    await saveDocument(mInv);

    const yInv = await createDraft('invoice');
    yInv.number = 'INV-NOTIF-Y';
    yInv.client.name = 'Annual Corp';
    yInv.status = 'unpaid';
    yInv.issueDate = yearlyStart;
    yInv.billingFrequency = 'yearly';
    yInv.billingStartDate = yearlyStart;
    await saveDocument(yInv);

    const oneTimeInv = await createDraft('invoice');
    oneTimeInv.number = 'INV-ONETIME';
    oneTimeInv.client.name = 'OneTime Corp';
    oneTimeInv.status = 'unpaid';
    oneTimeInv.billingFrequency = 'one-time';
    await saveDocument(oneTimeInv);

    await visit('#/');
    const badges = () => [...container.querySelectorAll('[data-testid="notification-count"]')];
    expect(badges().length).toBeGreaterThan(0);
    expect(badges()[0].textContent).toBe('2');

    const bellBtn = container.querySelector('[aria-label^="Notifications"]') as HTMLButtonElement | null;
    expect(bellBtn).not.toBeNull();
    await act(async () => { bellBtn!.click(); });
    await settle(20);

    const dialog = container.querySelector('[role="dialog"][aria-label="Notifications"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('INV-NOTIF-M');
    expect(dialog!.textContent).toContain('INV-NOTIF-Y');
    expect(dialog!.textContent).not.toContain('INV-ONETIME');

    const firstItem = [...dialog!.querySelectorAll('button')].find((b) => b.textContent?.includes('INV-NOTIF-M'));
    expect(firstItem).toBeDefined();
    await act(async () => { firstItem!.click(); });
    await settle();

    expect(badges()[0].textContent).toBe('1');
  });

  it('raised no uncaught errors', () => {
    expect(errors).toEqual([]);
  });
});
