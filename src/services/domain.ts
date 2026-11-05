// Domain constants and pure helpers shared by UI, PDF and storage.

import type {
  Address, AppSettings, BankDetails, ClientSnapshot, CompanyProfile, DocStatus, DocType, DocumentRecord, Frequency,
  LineItem, NumberingKey, NumberingRule, PaymentMethod, PaymentTermsKey, ServiceItem, TaxMode, TaxTreatment, TemplateId, Unit,
} from '../types';
import { addDays, nowIso, todayStr, uid } from '../utils/misc';

export const SCHEMA_VERSION = 1;

export interface DocTypeMeta {
  label: string; // UI singular
  plural: string;
  pdfTitle: string;
  pdfShortTitle: string; // filename prefix
  route: string;
  dueLabel: string;
  partyLabel: string;
  statuses: DocStatus[];
}

export const DOC_META: Record<DocType, DocTypeMeta> = {
  invoice: {
    label: 'Invoice', plural: 'Invoices', pdfTitle: 'INVOICE', pdfShortTitle: 'Invoice', route: 'invoice',
    dueLabel: 'Due date', partyLabel: 'Bill To', statuses: ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  },
  quotation: {
    label: 'Quotation', plural: 'Quotations', pdfTitle: 'QUOTATION', pdfShortTitle: 'Quotation', route: 'quotation',
    dueLabel: 'Valid until', partyLabel: 'Prepared For', statuses: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'],
  },
  proforma: {
    label: 'Proforma Invoice', plural: 'Proforma Invoices', pdfTitle: 'PROFORMA INVOICE', pdfShortTitle: 'Proforma',
    route: 'proforma', dueLabel: 'Payment due', partyLabel: 'Bill To', statuses: ['draft', 'issued', 'paid', 'cancelled'],
  },
  'credit-note': {
    label: 'Credit Note', plural: 'Credit Notes', pdfTitle: 'CREDIT NOTE', pdfShortTitle: 'CreditNote', route: 'credit-note',
    dueLabel: '', partyLabel: 'Issued To', statuses: ['draft', 'issued', 'cancelled'],
  },
  'debit-note': {
    label: 'Debit Note', plural: 'Debit Notes', pdfTitle: 'DEBIT NOTE', pdfShortTitle: 'DebitNote', route: 'debit-note',
    dueLabel: 'Due date', partyLabel: 'Issued To', statuses: ['draft', 'issued', 'cancelled'],
  },
  'purchase-order': {
    label: 'Purchase Order', plural: 'Purchase Orders', pdfTitle: 'PURCHASE ORDER', pdfShortTitle: 'PurchaseOrder',
    route: 'purchase-order', dueLabel: 'Delivery date', partyLabel: 'Supplier', statuses: ['draft', 'issued', 'fulfilled', 'cancelled'],
  },
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Draft', unpaid: 'Unpaid', partially_paid: 'Partially Paid', paid: 'Paid', overdue: 'Overdue',
  cancelled: 'Cancelled / Void', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', expired: 'Expired',
  converted: 'Converted', issued: 'Issued', fulfilled: 'Fulfilled',
};

export const UNIT_LABEL: Record<Unit, string> = {
  fixed: 'Fixed', hour: 'Hour', day: 'Day', week: 'Week', month: 'Month', year: 'Year', seat: 'User/Seat',
  milestone: 'Milestone', custom: 'Custom',
};

export const unitText = (unit: Unit, custom: string) => (unit === 'custom' ? custom || 'Unit' : UNIT_LABEL[unit]);

export const TREATMENT_LABEL: Record<TaxTreatment, string> = {
  taxable: 'Taxable', 'zero-rated': 'Zero-rated', exempt: 'Exempt', 'non-gst': 'Non-GST', 'out-of-scope': 'Out of scope',
};

export const TAX_MODE_LABEL: Record<TaxMode, string> = {
  intra: 'GST intra-state (CGST + SGST)',
  inter: 'GST inter-state (IGST)',
  other: 'Other tax (single rate, e.g. VAT)',
  none: 'No tax',
};

export const TAX_PRESETS = [0, 5, 12, 18, 28];

export const PAYMENT_TERMS: { key: PaymentTermsKey; label: string; days: number }[] = [
  { key: 'receipt', label: 'Due on receipt', days: 0 },
  { key: 'net7', label: 'Net 7', days: 7 },
  { key: 'net15', label: 'Net 15', days: 15 },
  { key: 'net30', label: 'Net 30', days: 30 },
  { key: 'net45', label: 'Net 45', days: 45 },
  { key: 'net60', label: 'Net 60', days: 60 },
  { key: 'custom', label: 'Custom (days)', days: 0 },
];

export function termsDays(key: PaymentTermsKey, custom: number): number {
  if (key === 'custom') return Math.max(0, Math.floor(custom || 0));
  return PAYMENT_TERMS.find((t) => t.key === key)?.days ?? 0;
}

export function termsLabel(key: PaymentTermsKey, custom: number): string {
  if (key === 'custom') return `Net ${termsDays(key, custom)} days`;
  return PAYMENT_TERMS.find((t) => t.key === key)?.label ?? '';
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank: 'Bank transfer', upi: 'UPI', cash: 'Cash', card: 'Card', cheque: 'Cheque', paypal: 'PayPal / other online', custom: 'Custom',
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', 'half-yearly': 'Half-yearly', yearly: 'Yearly',
};

export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: 'corporate', name: 'Corporate Blue', description: 'White background, navy headings, blue accents, formal B2B layout.' },
  { id: 'minimal', name: 'Minimal Professional', description: 'Black/gray typography, clean whitespace, simple rules.' },
  { id: 'modern', name: 'Technology Modern', description: 'Blue/purple accent strip, tinted cards, modern table.' },
  { id: 'executive', name: 'Executive', description: 'Dark-navy header band, strong hierarchy, formal totals block.' },
];

// GST state codes (first two digits of GSTIN).
export const INDIAN_STATES: { code: string; name: string }[] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
  ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'],
  ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory'], ['96', 'Other Country (export)'],
].map(([code, name]) => ({ code, name }));

export const stateLabel = (code: string) => {
  const s = INDIAN_STATES.find((x) => x.code === code);
  return s ? `${s.name} (${s.code})` : code;
};

/** Suggest (never decide) the GST presentation from configured states. */
export function suggestTaxMode(supplierState: string, placeOfSupply: string): TaxMode | null {
  if (!supplierState || !placeOfSupply) return null;
  return supplierState === placeOfSupply ? 'intra' : 'inter';
}

export const TAX_DISCLAIMER =
  'Tax calculations are based on the tax mode, rates and treatments you select. Verify tax classification, rates, place of supply and statutory invoice requirements with your accountant or official guidance. This app does not verify GSTINs or determine tax liability.';

// ----------------------------------------------------------------------------
// Defaults

export const emptyAddress = (): Address => ({ line1: '', line2: '', city: '', state: '', postalCode: '', country: '' });
export const emptyBank = (): BankDetails => ({ accountHolder: '', bankName: '', accountNumber: '', ifsc: '', branch: '', swift: '' });

export const emptyCompany = (): CompanyProfile => ({
  legalName: '', logo: null, address: { ...emptyAddress(), country: 'India' }, email: '', phone: '', website: '',
  gstin: '', pan: '', cin: '', bank: emptyBank(), upiId: '', showUpiQr: true, signatoryName: '', signatoryDesignation: '',
  signature: null, stamp: null, defaultPaymentTerms: 'net15', defaultNotes: 'Thank you for your business.',
  defaultTerms: 'Payment is due within the agreed terms. Please quote the invoice number with your payment.',
  defaultFooter: '', declaration: '',
});

const NUMBERING_PREFIX: Record<NumberingKey, string> = {
  invoice: 'INV-{YYYY}-', quotation: 'QT-{YYYY}-', proforma: 'PI-{YYYY}-', 'credit-note': 'CN-{YYYY}-',
  'debit-note': 'DN-{YYYY}-', 'purchase-order': 'PO-{YYYY}-', receipt: 'RCPT-{YYYY}-',
};

export const defaultSettings = (): AppSettings => ({
  schemaVersion: SCHEMA_VERSION,
  numbering: Object.fromEntries(
    (Object.keys(NUMBERING_PREFIX) as NumberingKey[]).map((k) => [k, { prefix: NUMBERING_PREFIX[k], next: 1, padding: 3 }]),
  ) as Record<NumberingKey, NumberingRule>,
  defaultCurrency: 'INR',
  defaultTemplate: 'corporate',
  defaultTaxMode: 'intra',
  defaultTaxRate: 18,
  branding: { primaryColor: '#1b3a87', secondaryColor: '#2f6fed', font: 'helvetica', logoAlign: 'left', showSignature: true },
  customFields: [],
  servicesSeeded: false,
  lastBackupAt: '',
});

export function formatNumbering(rule: NumberingRule, date = todayStr()): string {
  const prefix = resolvePrefix(rule.prefix, date);
  return `${prefix}${String(Math.max(0, Math.floor(rule.next))).padStart(Math.max(0, Math.min(10, rule.padding)), '0')}`;
}

export function resolvePrefix(prefix: string, date = todayStr()): string {
  const year = date.slice(0, 4);
  return prefix.replace(/\{YYYY\}/g, year).replace(/\{YY\}/g, year.slice(2));
}

/** Sequence number of `number` within the numbering prefix, or null if it doesn't follow the pattern. */
export function sequenceOf(number: string, prefix: string, date = todayStr()): number | null {
  for (const d of [date, todayStr()]) {
    const p = resolvePrefix(prefix, d);
    if (number.startsWith(p) && /^\d+$/.test(number.slice(p.length))) return parseInt(number.slice(p.length), 10);
  }
  return null;
}

export const emptyLine =(taxRate = 18, partial: Partial<LineItem> = {}): LineItem => ({
  id: uid(), description: '', serviceCode: '', quantity: 1, unit: 'fixed', customUnit: '', rate: 0,
  discountType: 'percent', discountValue: 0, taxRate, taxTreatment: 'taxable', ...partial,
});

export const lineFromService = (s: ServiceItem): LineItem =>
  emptyLine(s.taxRate, {
    description: s.description ? `${s.name}\n${s.description}` : s.name,
    serviceCode: s.serviceCode, unit: s.unit, customUnit: s.customUnit, rate: s.defaultRate,
  });

export const emptyClientSnapshot = (): ClientSnapshot => ({
  name: '', contactPerson: '', email: '', phone: '', billingAddress: emptyAddress(), shippingAddress: emptyAddress(), gstin: '', pan: '',
});

export function newDocument(type: DocType, settings: AppSettings, company: CompanyProfile): DocumentRecord {
  const issueDate = todayStr();
  const terms = company.defaultPaymentTerms;
  const dueOffset = type === 'quotation' ? 30 : type === 'purchase-order' ? 14 : termsDays(terms, 0);
  const supplierState = company.gstin && /^\d{2}/.test(company.gstin) ? company.gstin.slice(0, 2) : '';
  return {
    id: uid(), type, number: formatNumbering(settings.numbering[type], issueDate), status: 'draft', issueDate,
    dueDate: type === 'credit-note' ? '' : addDays(issueDate, dueOffset), currency: settings.defaultCurrency,
    paymentTerms: terms, customTermsDays: 0, companySnapshot: structuredClone(company), client: emptyClientSnapshot(),
    projectName: '', projectCode: '', poReference: '', supplierState, placeOfSupply: '', reverseCharge: false,
    servicePeriodFrom: '', servicePeriodTo: '', taxMode: settings.defaultTaxMode, taxLabel: 'VAT',
    items: [emptyLine(settings.defaultTaxRate)], invoiceDiscountType: 'percent', invoiceDiscountValue: 0, charges: [],
    advancePaid: 0, roundOff: false, notes: type === 'purchase-order' ? '' : company.defaultNotes,
    terms:
      type === 'purchase-order'
        ? 'Please quote this purchase order number on all invoices and delivery documents.'
        : type === 'quotation'
          ? 'This quotation is valid until the date shown. Work begins on written acceptance. Taxes are charged as shown.'
          : company.defaultTerms,
    footer: company.defaultFooter, referenceId: '', referenceNumber: '', reason: '',
    deliveryAddress: '', deliveryTerms: '', template: settings.defaultTemplate, statusOverride: null,
    customFields: (settings.customFields ?? [])
      .filter((f) => f.docTypes.includes(type))
      .map((f) => ({ id: f.id, label: f.label, value: f.defaultValue, showOnPdf: f.showOnPdf })),
    audit: [{ at: nowIso(), message: 'Created' }], archived: false, createdAt: nowIso(), updatedAt: nowIso(),
  };
}

/** Title printed on the PDF. Quotations/proformas are never labelled as tax invoices. */
export function documentTitle(doc: Pick<DocumentRecord, 'type' | 'taxMode' | 'companySnapshot'>): string {
  if (doc.type === 'invoice' && (doc.taxMode === 'intra' || doc.taxMode === 'inter') && doc.companySnapshot.gstin) {
    return 'TAX INVOICE';
  }
  return DOC_META[doc.type].pdfTitle;
}

/** Payment-aware status for invoices; time-aware for quotations. */
export function effectiveStatus(doc: DocumentRecord, balanceMinor: number, paidMinor: number, today = todayStr()): DocStatus {
  if (doc.statusOverride) return doc.statusOverride;
  if (doc.status === 'draft' || doc.status === 'cancelled') return doc.status;
  if (doc.type === 'invoice') {
    if (balanceMinor <= 0) return 'paid';
    const base: DocStatus = paidMinor > 0 ? 'partially_paid' : 'unpaid';
    if (doc.dueDate && doc.dueDate < today) return 'overdue';
    return base;
  }
  if (doc.type === 'quotation' && doc.status === 'sent' && doc.dueDate && doc.dueDate < today) return 'expired';
  return doc.status;
}

/** Statuses that represent a finalised (non-draft) document. */
export const isFinal = (doc: DocumentRecord) => doc.status !== 'draft';

export const STARTER_SERVICES: [string, string, Unit, number, string][] = [
  // [name, category, unit, rate, SAC]
  ['Web application development', 'Software development', 'fixed', 150000, '998314'],
  ['Frontend development', 'Software development', 'hour', 1500, '998314'],
  ['Backend / API development', 'Software development', 'hour', 1800, '998314'],
  ['Mobile app development', 'Software development', 'milestone', 100000, '998314'],
  ['Custom enterprise software', 'Software development', 'milestone', 250000, '998314'],
  ['Third-party integration', 'Software development', 'fixed', 40000, '998314'],
  ['AI/ML model development', 'AI and machine learning', 'milestone', 200000, '998314'],
  ['LLM integration', 'AI and machine learning', 'fixed', 80000, '998314'],
  ['Chatbot development', 'AI and machine learning', 'fixed', 60000, '998314'],
  ['Computer vision solution', 'AI and machine learning', 'milestone', 150000, '998314'],
  ['Model deployment', 'AI and machine learning', 'fixed', 50000, '998315'],
  ['Data engineering', 'AI and machine learning', 'day', 12000, '998314'],
  ['Cloud hosting', 'Cloud and infrastructure', 'month', 8000, '998315'],
  ['Server management', 'Cloud and infrastructure', 'month', 10000, '998316'],
  ['DevOps engineering', 'Cloud and infrastructure', 'hour', 2000, '998316'],
  ['Database administration', 'Cloud and infrastructure', 'month', 12000, '998316'],
  ['Monitoring & backups', 'Cloud and infrastructure', 'month', 5000, '998316'],
  ['Monthly subscription', 'SaaS and licensing', 'month', 4999, '997331'],
  ['Annual licence', 'SaaS and licensing', 'year', 49999, '997331'],
  ['User seat licence', 'SaaS and licensing', 'seat', 999, '997331'],
  ['Onboarding & setup', 'SaaS and licensing', 'fixed', 15000, '998314'],
  ['Annual maintenance contract (AMC)', 'Maintenance and support', 'year', 120000, '998713'],
  ['Technical support', 'Maintenance and support', 'hour', 1200, '998316'],
  ['Bug fixes & upgrades', 'Maintenance and support', 'hour', 1500, '998314'],
  ['Security updates', 'Maintenance and support', 'month', 6000, '998316'],
  ['SLA support retainer', 'Maintenance and support', 'month', 25000, '998316'],
  ['UI/UX design', 'Design and consulting', 'fixed', 60000, '998391'],
  ['Software architecture review', 'Design and consulting', 'day', 15000, '998312'],
  ['IT consulting', 'Design and consulting', 'hour', 2500, '998312'],
  ['QA / testing', 'Design and consulting', 'hour', 1200, '998314'],
  ['Technical documentation', 'Design and consulting', 'fixed', 20000, '998314'],
];

export function starterServices(): ServiceItem[] {
  const t = nowIso();
  return STARTER_SERVICES.map(([name, category, unit, rate, sac]) => ({
    id: uid(), name, category, description: '', unit, customUnit: '', defaultRate: rate, taxRate: 18,
    serviceCode: sac, active: true, createdAt: t, updatedAt: t,
  }));
}
