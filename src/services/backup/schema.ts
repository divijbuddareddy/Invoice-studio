// Versioned backup format + strict validation of untrusted import files (pure, no storage access).

import { z } from 'zod';
import { SCHEMA_VERSION, defaultSettings, emptyCompany } from '../domain';
import { isSafeImageDataUrl } from '../../utils/image';
import type { AppSettings, Client, CompanyProfile, DocumentRecord, Payment, RecurrenceRule, ServiceItem } from '../../types';

export const BACKUP_APP_ID = 'software-invoice-studio';
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

const str = (max = 5000) => z.string().max(max).default('');
const num = z.number().finite();
const id = z.string().min(1).max(100);
const date = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Expected yyyy-mm-dd').default('');
const image = z
  .object({ dataUrl: z.string().refine(isSafeImageDataUrl, 'Image is not a safe PNG/JPEG or exceeds size limit'), width: num, height: num })
  .nullable()
  .optional();

const address = z.object({ line1: str(300), line2: str(300), city: str(100), state: str(100), postalCode: str(20), country: str(100) });
const bank = z.object({ accountHolder: str(200), bankName: str(200), accountNumber: str(50), ifsc: str(20), branch: str(200), swift: str(20) });

const termsKey = z.enum(['receipt', 'net7', 'net15', 'net30', 'net45', 'net60', 'custom']);
const unit = z.enum(['fixed', 'hour', 'day', 'week', 'month', 'year', 'seat', 'milestone', 'custom']);
const discountType = z.enum(['percent', 'fixed']);
const docType = z.enum(['invoice', 'quotation', 'proforma', 'credit-note', 'debit-note', 'purchase-order']);
const status = z.enum([
  'draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'issued', 'fulfilled',
]);

export const companySchema = z.object({
  legalName: str(300), logo: image, address, email: str(200), phone: str(50), website: str(200), gstin: str(20), pan: str(20),
  cin: str(30), bank, upiId: str(200), showUpiQr: z.boolean().default(true), signatoryName: str(200), signatoryDesignation: str(200),
  signature: image, stamp: image, defaultPaymentTerms: termsKey.default('net15'), defaultNotes: str(), defaultTerms: str(),
  defaultFooter: str(), declaration: str(),
});

const clientSchema = z.object({
  id, name: z.string().min(1).max(300), contactPerson: str(200), email: str(200), phone: str(50), billingAddress: address,
  shippingAddress: address, gstin: str(20), pan: str(20), notes: str(), archived: z.boolean().default(false),
  createdAt: z.string(), updatedAt: z.string(),
});

const serviceSchema = z.object({
  id, name: z.string().min(1).max(300), category: str(200), description: str(), unit, customUnit: str(50),
  defaultRate: num.nonnegative(), taxRate: num.min(0).max(100), serviceCode: str(50), active: z.boolean().default(true),
  createdAt: z.string(), updatedAt: z.string(),
});

const lineSchema = z.object({
  id, description: str(), serviceCode: str(50), quantity: num.nonnegative(), unit, customUnit: str(50), rate: num.nonnegative(),
  discountType, discountValue: num.nonnegative(), taxRate: num.min(0).max(100),
  taxTreatment: z.enum(['taxable', 'zero-rated', 'exempt', 'non-gst', 'out-of-scope']),
});

const clientSnapshot = z.object({
  clientId: z.string().optional(), name: str(300), contactPerson: str(200), email: str(200), phone: str(50),
  billingAddress: address, shippingAddress: address, gstin: str(20), pan: str(20),
});

const customFieldValue = z.object({ id, label: str(100), value: str(1000), showOnPdf: z.boolean().default(true) });
const customFieldDef = z.object({ id, label: str(100), docTypes: z.array(docType).max(10), defaultValue: str(1000), showOnPdf: z.boolean().default(true) });

const documentSchema = z.object({
  id, type: docType, number: z.string().max(100), status, issueDate: date, dueDate: date, currency: z.string().regex(/^[A-Z]{3}$/),
  paymentTerms: termsKey, customTermsDays: num.default(0), companySnapshot: companySchema, client: clientSnapshot,
  projectName: str(300), projectCode: str(100), poReference: str(100), supplierState: str(10), placeOfSupply: str(10),
  reverseCharge: z.boolean().default(false), servicePeriodFrom: date, servicePeriodTo: date,
  taxMode: z.enum(['intra', 'inter', 'other', 'none']), taxLabel: str(30), items: z.array(lineSchema).max(2000),
  invoiceDiscountType: discountType, invoiceDiscountValue: num.nonnegative(),
  charges: z.array(z.object({ id, label: str(200), amount: num.nonnegative(), taxRate: num.min(0).max(100) })).max(100),
  advancePaid: num.nonnegative(), roundOff: z.boolean().default(false), notes: str(), terms: str(), footer: str(),
  referenceId: str(100), referenceNumber: str(100), reason: str(), deliveryAddress: str(), deliveryTerms: str(),
  template: z.enum(['corporate', 'minimal', 'modern', 'executive']), statusOverride: status.nullable().optional(),
  customFields: z.array(customFieldValue).max(50).default([]),
  audit: z.array(z.object({ at: z.string(), message: str(1000) })).default([]), recurrenceId: z.string().optional(),
  recurrencePeriod: z.string().optional(), convertedToId: z.string().optional(), archived: z.boolean().default(false),
  createdAt: z.string(), updatedAt: z.string(),
});

const paymentSchema = z.object({
  id, documentId: id, receiptNumber: str(100), date, amount: num.positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  method: z.enum(['bank', 'upi', 'cash', 'card', 'cheque', 'paypal', 'custom']), customMethod: str(100), reference: str(200),
  notes: str(), createdAt: z.string(),
});

const recurrenceSchema = z.object({
  id, sourceDocumentId: id, frequency: z.enum(['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']), startDate: date,
  endDate: date, nextDate: date, lastGeneratedPeriod: str(20), active: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
});

const numberingRule = z.object({ prefix: str(40), next: z.number().int().min(0), padding: z.number().int().min(0).max(10) });
const settingsSchema = z.object({
  schemaVersion: z.number().int(),
  numbering: z.record(numberingRule),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  defaultTemplate: z.enum(['corporate', 'minimal', 'modern', 'executive']),
  defaultTaxMode: z.enum(['intra', 'inter', 'other', 'none']),
  defaultTaxRate: num.min(0).max(100),
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    font: z.enum(['helvetica', 'times', 'courier', 'noto']), logoAlign: z.enum(['left', 'center', 'right']), showSignature: z.boolean(),
  }),
  customFields: z.array(customFieldDef).max(50).default([]),
  servicesSeeded: z.boolean().default(true),
  lastBackupAt: str(40),
});

export const backupSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  data: z.object({
    company: companySchema.nullable(),
    settings: settingsSchema.nullable(),
    clients: z.array(clientSchema),
    services: z.array(serviceSchema),
    documents: z.array(documentSchema),
    payments: z.array(paymentSchema),
    recurrences: z.array(recurrenceSchema),
  }),
});

export interface BackupData {
  company: CompanyProfile | null;
  settings: AppSettings | null;
  clients: Client[];
  services: ServiceItem[];
  documents: DocumentRecord[];
  payments: Payment[];
  recurrences: RecurrenceRule[];
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

/** Parse and validate an untrusted backup file's text. Never throws. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'Backup file is larger than 50 MB and was rejected.' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON. Choose a backup exported from Software Invoice Studio.' };
  }
  const head = json as { app?: unknown; schemaVersion?: unknown };
  if (!head || typeof head !== 'object' || head.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'This JSON file is not a Software Invoice Studio backup.' };
  }
  if (typeof head.schemaVersion !== 'number' || head.schemaVersion > SCHEMA_VERSION || head.schemaVersion < 1) {
    return {
      ok: false,
      error: `Unsupported backup version (${String(head.schemaVersion)}). This app supports version ${SCHEMA_VERSION}. Update the app or use a matching backup.`,
    };
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `Backup is malformed at "${issue.path.join('.')}": ${issue.message}. Nothing was imported.` };
  }
  const data = result.data.data as unknown as BackupData;
  // Fill any fields added in newer minor revisions with defaults.
  if (data.company) data.company = { ...emptyCompany(), ...data.company };
  if (data.settings) {
    const d = defaultSettings();
    data.settings = { ...d, ...data.settings, numbering: { ...d.numbering, ...data.settings.numbering }, schemaVersion: SCHEMA_VERSION };
  }
  return { ok: true, backup: { ...(result.data as unknown as BackupFile), data } };
}

export function backupCounts(d: BackupData) {
  return {
    'Company profile': d.company ? 1 : 0,
    Clients: d.clients.length,
    Services: d.services.length,
    Documents: d.documents.length,
    Payments: d.payments.length,
    'Recurring schedules': d.recurrences.length,
  };
}
