// Document lifecycle operations. All writes go through the storage abstraction.

import type { DocStatus, DocType, DocumentRecord, Payment, RecurrenceRule } from '../../types';
import { db, getCompany, getSettings, guard } from '../../services/storage/db';
import { DOC_META, STATUS_LABEL, formatNumbering, newDocument, sequenceOf } from '../../services/domain';
import { nowIso, todayStr, uid } from '../../utils/misc';
import { buildRecurringDraft, dueOccurrences, nextAfter } from '../recurring/recurring';

export async function createDraft(type: DocType): Promise<DocumentRecord> {
  const [settings, company] = await Promise.all([getSettings(), getCompany()]);
  return newDocument(type, settings, company);
}

export async function isNumberTaken(doc: Pick<DocumentRecord, 'id' | 'type' | 'number'>): Promise<boolean> {
  const n = doc.number.trim();
  if (!n) return false;
  const same = await db.documents.where('number').equals(n).toArray();
  return same.some((d) => d.type === doc.type && d.id !== doc.id);
}

/**
 * Persist a document. When saving a new record whose number matches (or exceeds) the
 * configured counter, the counter advances so the next document gets a fresh number.
 */
export async function saveDocument(doc: DocumentRecord, auditMessage?: string): Promise<DocumentRecord> {
  return guard(() =>
    db.transaction('rw', db.documents, db.meta, async () => {
      const existing = await db.documents.get(doc.id);
      const settings = await getSettings();
      const rule = settings.numbering[doc.type];
      const next: DocumentRecord = {
        ...doc,
        number: doc.number.trim(),
        updatedAt: nowIso(),
        audit: auditMessage ? [...doc.audit, { at: nowIso(), message: auditMessage }] : doc.audit,
      };
      if (!existing) {
        const seq = sequenceOf(next.number, rule.prefix, doc.issueDate);
        if (seq !== null && seq >= rule.next) {
          settings.numbering[doc.type] = { ...rule, next: seq + 1 };
          await db.meta.put({ key: 'settings', value: settings });
        }
      }
      await db.documents.put(next);
      return next;
    }),
  );
}

export async function setStatus(doc: DocumentRecord, status: DocStatus, note?: string): Promise<void> {
  await saveDocument({ ...doc, status, statusOverride: null }, note ?? `Status changed to ${STATUS_LABEL[status]}`);
}

/** Manual override of a computed status (requires confirmation in the UI; logged). */
export async function overrideStatus(doc: DocumentRecord, status: DocStatus | null, reason: string): Promise<void> {
  await saveDocument(
    { ...doc, statusOverride: status },
    status ? `Status manually overridden to ${STATUS_LABEL[status]}${reason ? ` — ${reason}` : ''}` : 'Manual status override removed',
  );
}

export async function duplicateDocument(src: DocumentRecord, asType?: DocType): Promise<DocumentRecord> {
  const type = asType ?? src.type;
  const [settings, company] = await Promise.all([getSettings(), getCompany()]);
  const fresh = newDocument(type, settings, company);
  const copy: DocumentRecord = {
    ...structuredClone(src),
    id: fresh.id,
    type,
    number: fresh.number,
    status: 'draft',
    statusOverride: null,
    issueDate: fresh.issueDate,
    dueDate: fresh.dueDate,
    companySnapshot: company,
    items: src.items.map((i) => ({ ...i, id: uid() })),
    advancePaid: 0,
    recurrenceId: undefined,
    recurrencePeriod: undefined,
    convertedToId: undefined,
    referenceId: type === src.type ? src.referenceId : '',
    referenceNumber: type === src.type ? src.referenceNumber : '',
    archived: false,
    audit: [{ at: nowIso(), message: `Created as a copy of ${DOC_META[src.type].label} ${src.number}` }],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return copy;
}

/** Convert an accepted quotation (or proforma) to an invoice draft and link them. */
export async function convertToInvoice(src: DocumentRecord): Promise<DocumentRecord> {
  const inv = await duplicateDocument(src, 'invoice');
  inv.referenceId = src.id;
  inv.referenceNumber = src.number;
  inv.audit = [{ at: nowIso(), message: `Converted from ${DOC_META[src.type].label} ${src.number}` }];
  const saved = await saveDocument(inv);
  await saveDocument(
    { ...src, status: src.type === 'quotation' ? 'converted' : src.status, convertedToId: saved.id },
    `Converted to invoice ${saved.number}`,
  );
  return saved;
}

/** Create a credit/debit note draft linked to an invoice. */
export async function noteFromInvoice(inv: DocumentRecord, type: 'credit-note' | 'debit-note'): Promise<DocumentRecord> {
  const note = await duplicateDocument(inv, type);
  note.referenceId = inv.id;
  note.referenceNumber = inv.number;
  note.dueDate = type === 'credit-note' ? '' : note.dueDate;
  note.charges = [];
  note.invoiceDiscountValue = 0;
  note.audit = [{ at: nowIso(), message: `Created against invoice ${inv.number}` }];
  return note;
}

export async function nextReceiptNumber(): Promise<string> {
  const s = await getSettings();
  return formatNumbering(s.numbering.receipt);
}

export async function recordPayment(p: Omit<Payment, 'id' | 'createdAt'>, doc: DocumentRecord): Promise<Payment> {
  return guard(() =>
    db.transaction('rw', db.payments, db.documents, db.meta, async () => {
      const payment: Payment = { ...p, id: uid(), createdAt: nowIso() };
      await db.payments.put(payment);
      const settings = await getSettings();
      const r = settings.numbering.receipt;
      if (formatNumbering(r) === payment.receiptNumber) {
        settings.numbering.receipt = { ...r, next: r.next + 1 };
        await db.meta.put({ key: 'settings', value: settings });
      }
      const fresh = (await db.documents.get(doc.id)) ?? doc;
      await db.documents.put({
        ...fresh,
        status: fresh.status === 'draft' ? 'unpaid' : fresh.status,
        updatedAt: nowIso(),
        audit: [...fresh.audit, { at: nowIso(), message: `Payment ${payment.receiptNumber} recorded: ${payment.currency} ${payment.amount}` }],
      });
      return payment;
    }),
  );
}

export async function removePayment(p: Payment): Promise<void> {
  await guard(() =>
    db.transaction('rw', db.payments, db.documents, async () => {
      await db.payments.delete(p.id);
      const doc = await db.documents.get(p.documentId);
      if (doc) await db.documents.put({ ...doc, updatedAt: nowIso(), audit: [...doc.audit, { at: nowIso(), message: `Payment ${p.receiptNumber} deleted` }] });
    }),
  );
}

// ---- recurring -----------------------------------------------------------------------------

export interface DueItem { rule: RecurrenceRule; source: DocumentRecord; periods: string[] }

export async function findDueRecurrences(today = todayStr()): Promise<DueItem[]> {
  const rules = await db.recurrences.toArray();
  const out: DueItem[] = [];
  for (const rule of rules) {
    const periods = dueOccurrences(rule, today);
    if (!periods.length) continue;
    const source = await db.documents.get(rule.sourceDocumentId);
    if (source) out.push({ rule, source, periods });
  }
  return out;
}

export async function generateDueDrafts(items: DueItem[]): Promise<number> {
  let created = 0;
  await guard(() =>
    db.transaction('rw', db.documents, db.recurrences, db.meta, async () => {
      const settings = await getSettings();
      for (const { rule, source, periods } of items) {
        const existing = await db.documents.where('recurrenceId').equals(rule.id).toArray();
        let last = rule.lastGeneratedPeriod;
        for (const period of periods) {
          const numRule = settings.numbering.invoice;
          const draft = buildRecurringDraft(source, rule, period, formatNumbering(numRule, period), existing);
          if (draft) {
            draft.companySnapshot = (await getCompany()) ?? draft.companySnapshot;
            await db.documents.put(draft);
            existing.push(draft);
            settings.numbering.invoice = { ...numRule, next: numRule.next + 1 };
            created++;
          }
          last = period;
        }
        const nextDate = nextAfter(rule, last);
        await db.recurrences.put({
          ...rule,
          lastGeneratedPeriod: last,
          nextDate,
          active: rule.endDate ? nextDate <= rule.endDate && rule.active : rule.active,
          updatedAt: nowIso(),
        });
      }
      await db.meta.put({ key: 'settings', value: settings });
    }),
  );
  return created;
}
