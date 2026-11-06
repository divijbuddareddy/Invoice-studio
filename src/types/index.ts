// Core domain types for Software Invoice Studio.

export type DocType = 'invoice' | 'quotation' | 'proforma' | 'credit-note' | 'debit-note' | 'purchase-order';
export const DOC_TYPES: DocType[] = ['invoice', 'quotation', 'proforma', 'credit-note', 'debit-note', 'purchase-order'];

export type DocStatus =
  | 'draft'
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'converted'
  | 'issued'
  | 'fulfilled';

export type Unit = 'fixed' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'seat' | 'milestone' | 'custom';
export const UNITS: Unit[] = ['fixed', 'hour', 'day', 'week', 'month', 'year', 'seat', 'milestone', 'custom'];

export type DiscountType = 'percent' | 'fixed';
export type TaxTreatment = 'taxable' | 'zero-rated' | 'exempt' | 'non-gst' | 'out-of-scope';
/** intra = CGST+SGST, inter = IGST, other = single named tax (e.g. VAT), none = no tax shown */
export type TaxMode = 'intra' | 'inter' | 'other' | 'none';

export type TemplateId = 'corporate' | 'minimal' | 'modern' | 'executive';
/** 'noto' = bundled Noto Sans (Unicode: ₹, €, accented/Greek/Cyrillic text), loaded locally on demand. */
export type PdfFont = 'helvetica' | 'times' | 'courier' | 'noto';

/** A user-defined field (configured in Settings) that appears on selected document types. */
export interface CustomFieldDef {
  id: string;
  label: string;
  docTypes: DocType[];
  defaultValue: string;
  showOnPdf: boolean;
}

/** A custom field value stored on a document (label is snapshotted with the document). */
export interface CustomFieldValue {
  id: string;
  label: string;
  value: string;
  showOnPdf: boolean;
}
export type LogoAlign = 'left' | 'center' | 'right';

export interface StoredImage {
  dataUrl: string; // PNG or JPEG data URL (SVGs are rasterised on upload)
  width: number;
  height: number;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface BankDetails {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  swift: string;
}

export interface CompanyProfile {
  legalName: string;
  logo?: StoredImage | null;
  address: Address;
  email: string;
  phone: string;
  website: string;
  gstin: string;
  pan: string;
  cin: string;
  bank: BankDetails;
  upiId: string;
  showUpiQr: boolean;
  signatoryName: string;
  signatoryDesignation: string;
  signature?: StoredImage | null;
  stamp?: StoredImage | null;
  defaultPaymentTerms: PaymentTermsKey;
  defaultNotes: string;
  defaultTerms: string;
  defaultFooter: string;
  declaration: string;
}

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress: Address;
  shippingAddress: Address;
  gstin: string;
  pan: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  description: string;
  unit: Unit;
  customUnit: string;
  defaultRate: number; // major units
  taxRate: number; // percent
  serviceCode: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  description: string;
  serviceCode: string;
  quantity: number;
  unit: Unit;
  customUnit: string;
  rate: number; // major units
  discountType: DiscountType;
  discountValue: number;
  taxRate: number; // percent
  taxTreatment: TaxTreatment;
}

export interface Charge {
  id: string;
  label: string;
  amount: number; // major units
  taxRate: number;
}

export type PaymentTermsKey = 'paid' | 'receipt' | 'net7' | 'net15' | 'net30' | 'net45' | 'net60' | 'custom';

export interface ClientSnapshot {
  clientId?: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress: Address;
  shippingAddress: Address;
  gstin: string;
  pan: string;
}

export interface AuditEntry {
  at: string;
  message: string;
}

export interface DocumentRecord {
  id: string;
  type: DocType;
  number: string;
  status: DocStatus;
  issueDate: string; // yyyy-mm-dd
  dueDate: string; // invoice/proforma due date, quotation validity, PO delivery date
  currency: string;
  paymentTerms: PaymentTermsKey;
  customTermsDays: number;
  companySnapshot: CompanyProfile;
  client: ClientSnapshot;
  projectName: string;
  projectCode: string;
  poReference: string;
  supplierState: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  servicePeriodFrom: string;
  servicePeriodTo: string;
  taxMode: TaxMode;
  taxLabel: string; // used for taxMode 'other' (e.g. VAT)
  items: LineItem[];
  invoiceDiscountType: DiscountType;
  invoiceDiscountValue: number;
  charges: Charge[];
  advancePaid: number; // major units, recorded on the document itself
  roundOff: boolean;
  notes: string;
  terms: string;
  footer: string;
  // linked document (credit/debit note → invoice; invoice ← quotation)
  referenceId: string;
  referenceNumber: string;
  reason: string;
  // purchase order
  deliveryAddress: string;
  deliveryTerms: string;
  template: TemplateId;
  customFields?: CustomFieldValue[];
  statusOverride?: DocStatus | null;
  audit: AuditEntry[];
  recurrenceId?: string;
  recurrencePeriod?: string;
  convertedToId?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'bank' | 'upi' | 'cash' | 'card' | 'cheque' | 'paypal' | 'custom';

export interface Payment {
  id: string;
  documentId: string;
  receiptNumber: string;
  date: string;
  amount: number; // major units
  currency: string;
  method: PaymentMethod;
  customMethod: string;
  reference: string;
  notes: string;
  createdAt: string;
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

export interface RecurrenceRule {
  id: string;
  sourceDocumentId: string;
  frequency: Frequency;
  startDate: string;
  endDate: string; // '' = no end
  nextDate: string;
  lastGeneratedPeriod: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NumberingRule {
  prefix: string; // supports {YYYY} and {YY}
  next: number;
  padding: number;
}

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  font: PdfFont;
  logoAlign: LogoAlign;
  showSignature: boolean;
}

export type NumberingKey = DocType | 'receipt';

export interface AppSettings {
  schemaVersion: number;
  numbering: Record<NumberingKey, NumberingRule>;
  defaultCurrency: string;
  defaultTemplate: TemplateId;
  defaultTaxMode: TaxMode;
  defaultTaxRate: number;
  branding: Branding;
  customFields: CustomFieldDef[];
  servicesSeeded: boolean;
  lastBackupAt: string;
}
