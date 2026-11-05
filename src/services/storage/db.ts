// Storage abstraction. UI components call these functions/hooks — never IndexedDB directly.

import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppSettings, Client, CompanyProfile, DocumentRecord, Payment, RecurrenceRule, ServiceItem } from '../../types';
import { defaultSettings, emptyCompany, starterServices } from '../domain';

interface MetaRow {
  key: string;
  value: unknown;
}

class StudioDB extends Dexie {
  meta!: Table<MetaRow, string>;
  clients!: Table<Client, string>;
  services!: Table<ServiceItem, string>;
  documents!: Table<DocumentRecord, string>;
  payments!: Table<Payment, string>;
  recurrences!: Table<RecurrenceRule, string>;

  constructor() {
    super('software-invoice-studio');
    this.version(1).stores({
      meta: 'key',
      clients: 'id, name, email, gstin, archived',
      services: 'id, name, category',
      documents: 'id, type, number, status, issueDate, archived, recurrenceId',
      payments: 'id, documentId, date',
      recurrences: 'id, sourceDocumentId, active, nextDate',
    });
  }
}

export const db = new StudioDB();

export class StorageError extends Error {}

/** Wraps a storage write and converts browser errors into actionable messages. */
export async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
    if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
      throw new StorageError(
        'Browser storage is full. Your change was NOT saved. Export a backup, remove large images or old records, then retry.',
      );
    }
    if (name === 'MissingAPIError' || name === 'InvalidStateError') {
      throw new StorageError(
        'Local storage (IndexedDB) is unavailable — private browsing or blocked site data can cause this. Your change was NOT saved.',
      );
    }
    throw new StorageError(`Could not save to local storage: ${(e as Error)?.message ?? 'unknown error'}. Your change was NOT saved.`);
  }
}

// ---- singletons -------------------------------------------------------------

export async function getCompany(): Promise<CompanyProfile> {
  const row = await db.meta.get('company');
  return { ...emptyCompany(), ...((row?.value as CompanyProfile) ?? {}) };
}
export const saveCompany = (c: CompanyProfile) => guard(() => db.meta.put({ key: 'company', value: c }));

export async function getSettings(): Promise<AppSettings> {
  const row = await db.meta.get('settings');
  const d = defaultSettings();
  const v = (row?.value as Partial<AppSettings>) ?? {};
  return {
    ...d, ...v, numbering: { ...d.numbering, ...(v.numbering ?? {}) }, branding: { ...d.branding, ...(v.branding ?? {}) },
    customFields: v.customFields ?? [],
  };
}
export const saveSettings = (s: AppSettings) => guard(() => db.meta.put({ key: 'settings', value: s }));

export async function updateSettings(patch: (s: AppSettings) => AppSettings | void): Promise<AppSettings> {
  return guard(() =>
    db.transaction('rw', db.meta, async () => {
      const cur = await getSettings();
      const next = patch(cur) ?? cur;
      await db.meta.put({ key: 'settings', value: next });
      return next;
    }),
  );
}

/** First-run setup: seed the editable starter service catalogue exactly once. */
export async function initStorage(): Promise<void> {
  await db.open();
  const s = await getSettings();
  if (!s.servicesSeeded) {
    await guard(() =>
      db.transaction('rw', db.services, db.meta, async () => {
        if ((await db.services.count()) === 0) await db.services.bulkAdd(starterServices());
        await db.meta.put({ key: 'settings', value: { ...s, servicesSeeded: true } });
      }),
    );
  }
}

// ---- hooks ---------------------------------------------------------------------

export const useCompany = () => useLiveQuery(getCompany, []);
export const useSettings = () => useLiveQuery(getSettings, []);
export const useClients = () => useLiveQuery(() => db.clients.orderBy('name').toArray(), []);
export const useServices = () => useLiveQuery(() => db.services.orderBy('name').toArray(), []);
export const useDocuments = () => useLiveQuery(() => db.documents.toArray(), []);
export const usePayments = () => useLiveQuery(() => db.payments.toArray(), []);
export const useRecurrences = () => useLiveQuery(() => db.recurrences.toArray(), []);
export const useDocument = (id: string | undefined) => useLiveQuery(() => (id ? db.documents.get(id) : undefined), [id]);

// ---- mutations -----------------------------------------------------------------

export const putClient = (c: Client) => guard(() => db.clients.put(c));
export const deleteClient = (id: string) => guard(() => db.clients.delete(id));
export const putService = (s: ServiceItem) => guard(() => db.services.put(s));
export const deleteService = (id: string) => guard(() => db.services.delete(id));
export const putDocument = (d: DocumentRecord) => guard(() => db.documents.put(d));
export const putPayment = (p: Payment) => guard(() => db.payments.put(p));
export const deletePayment = (id: string) => guard(() => db.payments.delete(id));
export const putRecurrence = (r: RecurrenceRule) => guard(() => db.recurrences.put(r));
export const deleteRecurrence = (id: string) => guard(() => db.recurrences.delete(id));

export async function deleteDocument(id: string): Promise<void> {
  await guard(() =>
    db.transaction('rw', db.documents, db.payments, db.recurrences, async () => {
      await db.payments.where('documentId').equals(id).delete();
      await db.recurrences.where('sourceDocumentId').equals(id).delete();
      await db.documents.delete(id);
    }),
  );
}

/** Reserve the next number for a type and return the formatted value used. */
export async function bumpNumbering(key: keyof AppSettings['numbering']): Promise<void> {
  await updateSettings((s) => {
    s.numbering[key] = { ...s.numbering[key], next: s.numbering[key].next + 1 };
  });
}

export async function clearAllData(): Promise<void> {
  await guard(() =>
    db.transaction('rw', [db.meta, db.clients, db.services, db.documents, db.payments, db.recurrences], async () => {
      await Promise.all([db.meta.clear(), db.clients.clear(), db.services.clear(), db.documents.clear(), db.payments.clear(), db.recurrences.clear()]);
      // Prevent re-seeding the starter catalogue after an explicit wipe until next reset.
      await db.meta.put({ key: 'settings', value: { ...defaultSettings(), servicesSeeded: true } });
    }),
  );
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}
